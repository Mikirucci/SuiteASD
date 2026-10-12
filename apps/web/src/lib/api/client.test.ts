import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";
import { ApiError, NetworkError } from "./errors";
import { createTokenStore, type TokenStore } from "./token-store";

const BASE = "http://api.test/api/v1";

function json(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json", ...headers },
  });
}

const session = (n: number) => ({
  accessToken: `access-${n}`,
  refreshToken: `refresh-${n}`,
  tokenType: "Bearer",
  expiresIn: 900,
});

function setup(responses: Array<Response | Error>) {
  const queue = [...responses];
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    const next = queue.shift();
    if (!next) throw new Error("unexpected extra request");
    if (next instanceof Error) throw next;
    return next;
  });
  const tokens = createTokenStore();
  const client = createApiClient({ baseUrl: BASE, tokens, fetchImpl });
  return { client, tokens, fetchImpl };
}

function calls(fetchImpl: ReturnType<typeof setup>["fetchImpl"]) {
  return fetchImpl.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: init?.method,
    headers: init?.headers as Record<string, string>,
    body: init?.body,
  }));
}

describe("api client", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("sends JSON, builds the query string and skips empty params", async () => {
    const { client, fetchImpl } = setup([json(200, { ok: true })]);
    await client.post(
      "/members",
      { name: "Anna" },
      { query: { team: "U16", q: "", page: undefined, active: true }, auth: false },
    );
    const [call] = calls(fetchImpl);
    expect(call?.url).toBe(`${BASE}/members?team=U16&active=true`);
    expect(call?.method).toBe("POST");
    expect(call?.headers["Content-Type"]).toBe("application/json");
    expect(call?.body).toBe(JSON.stringify({ name: "Anna" }));
  });

  it("attaches the Bearer token and the idempotency key", async () => {
    const { client, tokens, fetchImpl } = setup([json(200, {})]);
    tokens.setTokens({ accessToken: "abc", refreshToken: "r" });
    await client.post("/payments", { amount: 60 }, { idempotencyKey: "key-1" });
    const [call] = calls(fetchImpl);
    expect(call?.headers.Authorization).toBe("Bearer abc");
    expect(call?.headers["Idempotency-Key"]).toBe("key-1");
  });

  it("does not send credentials to public endpoints", async () => {
    const { client, tokens, fetchImpl } = setup([json(200, {})]);
    tokens.setTokens({ accessToken: "abc", refreshToken: "r" });
    await client.post("/auth/login", {}, { auth: false });
    expect(calls(fetchImpl)[0]?.headers.Authorization).toBeUndefined();
  });

  it("downloads a binary file with the Bearer token and reads the suggested file name", async () => {
    const pdf = new Response("%PDF-1.4", {
      status: 200,
      headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="ricevuta-0147.pdf"' },
    });
    const { client, tokens, fetchImpl } = setup([pdf]);
    tokens.setTokens({ accessToken: "abc", refreshToken: "r" });
    const file = await client.download("/fees/f1/receipt");
    expect(calls(fetchImpl)[0]?.headers.Authorization).toBe("Bearer abc");
    expect(file.filename).toBe("ricevuta-0147.pdf");
    expect(await file.blob.text()).toBe("%PDF-1.4");
  });

  it("raises ApiError when a download is refused", async () => {
    const { client } = setup([json(404, { title: "Not Found", status: 404, code: "not_found" })]);
    await expect(client.download("/fees/f1/receipt", { auth: false })).rejects.toMatchObject({ status: 404 });
  });

  it("uploads a file as is, with its own content type", async () => {
    const { client, fetchImpl } = setup([json(200, { ok: true })]);
    const file = new File(["%PDF-1.4"], "certificato.pdf", { type: "application/pdf" });
    await client.put("/documents/d1/file", file, { query: { fileName: "certificato.pdf" }, auth: false });
    const [call] = calls(fetchImpl);
    expect(call?.headers["Content-Type"]).toBe("application/pdf");
    expect(call?.body).toBe(file);
  });

  it("returns undefined for 204 responses", async () => {
    const { client } = setup([new Response(null, { status: 204 })]);
    await expect(client.delete("/members/1", { auth: false })).resolves.toBeUndefined();
  });

  it("turns RFC 7807 responses into ApiError with code and field errors", async () => {
    const problem = {
      type: "about:blank",
      title: "Unprocessable Content",
      status: 422,
      code: "validation_failed",
      detail: "Invalid body",
      errors: [{ path: "admin.email", message: "Invalid email" }],
    };
    const { client } = setup([json(422, problem)]);
    const error = await client.post("/auth/register", {}, { auth: false }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(422);
    expect(apiError.code).toBe("validation_failed");
    expect(apiError.fieldErrors).toEqual([{ path: "admin.email", message: "Invalid email" }]);
  });

  it("copes with error responses that are not problem+json", async () => {
    const { client } = setup([new Response("<html>Bad gateway</html>", { status: 502 })]);
    const error = (await client.get("/x", { auth: false }).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.problem).toBeNull();
  });

  it("exposes Retry-After on rate limiting", async () => {
    const { client } = setup([
      json(429, { type: "x", title: "Too Many Requests", status: 429, code: "rate_limited" }, { "Retry-After": "120" }),
    ]);
    const error = (await client.get("/x", { auth: false }).catch((e: unknown) => e)) as ApiError;
    expect(error.retryAfterSeconds).toBe(120);
  });

  it("maps connection failures to NetworkError", async () => {
    const { client } = setup([new TypeError("Failed to fetch")]);
    await expect(client.get("/x", { auth: false })).rejects.toBeInstanceOf(NetworkError);
  });

  describe("token refresh", () => {
    it("refreshes once on 401, stores the rotated tokens and retries the request", async () => {
      const { client, tokens, fetchImpl } = setup([
        json(401, { type: "x", title: "Unauthorized", status: 401, code: "unauthorized" }),
        json(200, session(2)),
        json(200, { members: [] }),
      ]);
      tokens.setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
      await expect(client.get("/members")).resolves.toEqual({ members: [] });

      const [first, refresh, retry] = calls(fetchImpl);
      expect(first?.headers.Authorization).toBe("Bearer access-1");
      expect(refresh?.url).toBe(`${BASE}/auth/refresh`);
      expect(refresh?.body).toBe(JSON.stringify({ refreshToken: "refresh-1" }));
      expect(retry?.headers.Authorization).toBe("Bearer access-2");
      expect(tokens.getRefreshToken()).toBe("refresh-2");
    });

    it("exchanges the stored refresh token before the first request after a reload", async () => {
      window.localStorage.setItem("suiteasd.refreshToken", "refresh-stored");
      const { client, fetchImpl } = setup([json(200, session(5)), json(200, { me: true })]);
      await client.get("/me");
      expect(calls(fetchImpl)[0]?.url).toBe(`${BASE}/auth/refresh`);
      expect(calls(fetchImpl)[1]?.headers.Authorization).toBe("Bearer access-5");
    });

    it("shares a single refresh between concurrent requests", async () => {
      const { client, tokens, fetchImpl } = setup([
        json(401, { type: "x", title: "Unauthorized", status: 401, code: "unauthorized" }),
        json(401, { type: "x", title: "Unauthorized", status: 401, code: "unauthorized" }),
        json(200, session(2)),
        json(200, { a: 1 }),
        json(200, { b: 2 }),
      ]);
      tokens.setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
      const results = await Promise.all([client.get("/a"), client.get("/b")]);
      expect(results).toEqual([{ a: 1 }, { b: 2 }]);
      expect(calls(fetchImpl).filter((call) => call.url.endsWith("/auth/refresh"))).toHaveLength(1);
    });

    it("ends the session and notifies listeners when the refresh token is rejected", async () => {
      const { client, tokens } = setup([
        json(401, { type: "x", title: "Unauthorized", status: 401, code: "unauthorized" }),
        json(401, { type: "x", title: "Unauthorized", status: 401, code: "unauthorized" }),
      ]);
      tokens.setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
      const expired = vi.fn();
      client.onSessionExpired(expired);
      await expect(client.get("/members")).rejects.toBeInstanceOf(ApiError);
      expect(expired).toHaveBeenCalledTimes(1);
      expect(tokens.getAccessToken()).toBeNull();
      expect(tokens.getRefreshToken()).toBeNull();
    });

    it("keeps the session when the refresh fails because the network is down", async () => {
      const { client, tokens } = setup([
        json(401, { type: "x", title: "Unauthorized", status: 401, code: "unauthorized" }),
        new TypeError("Failed to fetch"),
      ]);
      tokens.setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
      const expired = vi.fn();
      client.onSessionExpired(expired);
      await expect(client.get("/members")).rejects.toBeInstanceOf(NetworkError);
      expect(expired).not.toHaveBeenCalled();
      expect(tokens.getRefreshToken()).toBe("refresh-1");
    });

    it("does not try to refresh a 401 from a public endpoint such as login", async () => {
      const { client, tokens, fetchImpl } = setup([
        json(401, { type: "x", title: "Unauthorized", status: 401, code: "unauthorized" }),
      ]);
      tokens.setTokens({ accessToken: "access-1", refreshToken: "refresh-1" });
      await expect(client.post("/auth/login", {}, { auth: false })).rejects.toMatchObject({ status: 401 });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("unsubscribes listeners", async () => {
      const { client, tokens } = setup([
        json(401, { type: "x", title: "Unauthorized", status: 401, code: "unauthorized" }),
        json(401, { type: "x", title: "Unauthorized", status: 401, code: "unauthorized" }),
      ]);
      tokens.setTokens({ accessToken: "a", refreshToken: "r" });
      const listener = vi.fn();
      const unsubscribe = client.onSessionExpired(listener);
      unsubscribe();
      await client.get("/members").catch(() => undefined);
      expect(listener).not.toHaveBeenCalled();
    });
  });
});

describe("token store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps the access token in memory only and persists the refresh token", () => {
    const store: TokenStore = createTokenStore();
    store.setTokens({ accessToken: "a", refreshToken: "r" });
    expect(window.localStorage.getItem("suiteasd.refreshToken")).toBe("r");
    expect(Object.values({ ...window.localStorage })).not.toContain("a");
  });

  it("restores the refresh token after a reload and clears everything on logout", () => {
    window.localStorage.setItem("suiteasd.refreshToken", "stored");
    const store = createTokenStore();
    expect(store.getRefreshToken()).toBe("stored");
    expect(store.getAccessToken()).toBeNull();
    store.clear();
    expect(window.localStorage.getItem("suiteasd.refreshToken")).toBeNull();
  });

  it("survives unavailable storage", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const store = createTokenStore();
    expect(() => store.setTokens({ accessToken: "a", refreshToken: "r" })).not.toThrow();
    expect(store.getRefreshToken()).toBe("r");
    spy.mockRestore();
  });
});
