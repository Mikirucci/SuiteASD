import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "./client";
import { ApiError } from "./errors";
import type { RefreshLock } from "./refresh-lock";
import { createTokenStore, type ChannelLike, type SessionChange } from "./token-store";

const BASE = "http://api.test/api/v1";
const KEY = "suiteasd.refreshToken";

/** In-memory stand-in for BroadcastChannel: a message reaches every channel but the sender's, asynchronously. */
function createBus() {
  const channels = new Set<{ deliver(data: unknown): void }>();
  return {
    open(): ChannelLike {
      const listeners: Array<(event: { data: unknown }) => void> = [];
      const self = { deliver: (data: unknown) => listeners.forEach((listener) => listener({ data })) };
      channels.add(self);
      return {
        postMessage: (message) => {
          for (const other of channels) if (other !== self) queueMicrotask(() => other.deliver(message));
        },
        addEventListener: (_type, listener) => listeners.push(listener),
        close: () => channels.delete(self),
      };
    },
  };
}

/** One lock shared by the "tabs", like navigator.locks is shared by the tabs of a browser. */
function createLock(): RefreshLock {
  let tail: Promise<unknown> = Promise.resolve();
  return (task) => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" },
  });
}

const session = (n: number) => ({ accessToken: `access-${n}`, refreshToken: `refresh-${n}`, tokenType: "Bearer", expiresIn: 900 });

/** A fake backend that rotates refresh tokens and revokes everything when an old one is presented (token family). */
function createBackend() {
  let generation = 1;
  let revoked = false;
  const refreshBodies: string[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/refresh")) {
      const { refreshToken } = JSON.parse(String(init?.body)) as { refreshToken: string };
      refreshBodies.push(refreshToken);
      if (revoked || refreshToken !== `refresh-${generation}`) {
        revoked = true;
        return json(401, { status: 401, title: "Unauthorized" });
      }
      generation += 1;
      return json(200, session(generation));
    }
    const bearer = (init?.headers as Record<string, string>).Authorization;
    return bearer === `Bearer access-${generation}`
      ? json(200, { ok: true })
      : json(401, { status: 401, title: "Unauthorized" });
  });
  return { fetchImpl, refreshBodies, isRevoked: () => revoked };
}

function openTab(bus: ReturnType<typeof createBus>, lock: RefreshLock, backend: ReturnType<typeof createBackend>) {
  const tokens = createTokenStore({ openChannel: () => bus.open() });
  const client = createApiClient({ baseUrl: BASE, tokens, fetchImpl: backend.fetchImpl, lock });
  return { tokens, client };
}

describe("two tabs of the same browser", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renews once when both tabs find the access token expired", async () => {
    const bus = createBus();
    const lock = createLock();
    const backend = createBackend();
    const a = openTab(bus, lock, backend);
    const b = openTab(bus, lock, backend);
    // Both tabs signed in earlier and the backend has moved on: their access token is expired
    a.tokens.setTokens({ accessToken: "access-0", refreshToken: "refresh-1" });
    b.tokens.setTokens({ accessToken: "access-0", refreshToken: "refresh-1" });

    const [fromA, fromB] = await Promise.all([a.client.get("/me"), b.client.get("/me")]);

    expect(fromA).toEqual({ ok: true });
    expect(fromB).toEqual({ ok: true });
    expect(backend.refreshBodies).toEqual(["refresh-1"]);
    expect(backend.isRevoked()).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe("refresh-2");
  });

  it("does not call the backend again when the other tab renewed first and shared its access token", async () => {
    const bus = createBus();
    const lock = createLock();
    const backend = createBackend();
    const a = openTab(bus, lock, backend);
    const b = openTab(bus, lock, backend);
    a.tokens.setTokens({ accessToken: "access-0", refreshToken: "refresh-1" });
    b.tokens.setTokens({ accessToken: "access-0", refreshToken: "refresh-1" });

    await a.client.get("/me");
    await b.client.get("/me");

    expect(backend.refreshBodies).toHaveLength(1);
  });

  it("renews with the stored token when no access token ever arrives (no channel)", async () => {
    const lock = createLock();
    const backend = createBackend();
    const open = () => {
      const tokens = createTokenStore({ openChannel: () => null });
      return { tokens, client: createApiClient({ baseUrl: BASE, tokens, fetchImpl: backend.fetchImpl, lock }) };
    };
    const a = open();
    const b = open();
    a.tokens.setTokens({ accessToken: "access-0", refreshToken: "refresh-1" });
    b.tokens.setTokens({ accessToken: "access-0", refreshToken: "refresh-1" });

    await a.client.get("/me");
    // Tab B still holds refresh-1 in memory and the expired access token; storage says refresh-2
    await b.client.get("/me");

    // Two renewals, in sequence and each with the current token: the session survives
    expect(backend.refreshBodies).toEqual(["refresh-1", "refresh-2"]);
    expect(backend.isRevoked()).toBe(false);
  });

  it("works without the Web Locks API", async () => {
    const backend = createBackend();
    const tokens = createTokenStore({ openChannel: () => null });
    const client = createApiClient({ baseUrl: BASE, tokens, fetchImpl: backend.fetchImpl });
    tokens.setTokens({ accessToken: "access-0", refreshToken: "refresh-1" });
    expect(navigator.locks).toBeUndefined();
    await expect(client.get("/me")).resolves.toEqual({ ok: true });
  });

  it("keeps the session when a rejected refresh token had just been rotated by another tab", async () => {
    const lock: RefreshLock = (task) => task(); // tabs that do not coordinate: the worst case
    let generation = 1;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).endsWith("/auth/refresh")) {
        const { refreshToken } = JSON.parse(String(init?.body)) as { refreshToken: string };
        if (refreshToken === `refresh-${generation}`) {
          generation += 1;
          return json(200, session(generation));
        }
        // Another tab rotated it while this request was in flight
        window.localStorage.setItem(KEY, `refresh-${generation}`);
        return json(401, { status: 401, title: "Unauthorized" });
      }
      return json(200, { ok: true });
    });
    const tokens = createTokenStore({ openChannel: () => null });
    const client = createApiClient({ baseUrl: BASE, tokens, fetchImpl, lock });
    window.localStorage.setItem(KEY, "refresh-0");
    const expired = vi.fn();
    client.onSessionExpired(expired);

    await expect(client.get("/me")).resolves.toEqual({ ok: true });
    expect(expired).not.toHaveBeenCalled();
  });

  it("still logs out when the rejection is genuine", async () => {
    const backend = createBackend();
    const tokens = createTokenStore({ openChannel: () => null });
    const client = createApiClient({ baseUrl: BASE, tokens, fetchImpl: backend.fetchImpl, lock: createLock() });
    tokens.setTokens({ accessToken: "access-0", refreshToken: "refresh-9" });
    const expired = vi.fn();
    client.onSessionExpired(expired);
    await expect(client.get("/me")).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(tokens.getRefreshToken()).toBeNull();
  });
});

describe("token store across tabs", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  function changesOf(store: ReturnType<typeof createTokenStore>) {
    const seen: SessionChange[] = [];
    store.subscribe((change) => seen.push(change));
    return seen;
  }

  it("shares the renewed access token and stays silent for a plain renewal", async () => {
    const bus = createBus();
    const a = createTokenStore({ openChannel: () => bus.open() });
    const b = createTokenStore({ openChannel: () => bus.open() });
    a.setTokens({ accessToken: "a1", refreshToken: "r1" });
    await Promise.resolve();
    const seen = changesOf(b);
    a.setTokens({ accessToken: "a2", refreshToken: "r2" }, "refresh");
    await Promise.resolve();
    expect(b.getAccessToken()).toBe("a2");
    expect(b.getRefreshToken()).toBe("r2");
    expect(seen).toEqual([]);
  });

  it("tells the other tabs about a sign-in and a sign-out", async () => {
    const bus = createBus();
    const a = createTokenStore({ openChannel: () => bus.open() });
    const b = createTokenStore({ openChannel: () => bus.open() });
    const seen = changesOf(b);
    a.setTokens({ accessToken: "a1", refreshToken: "r1" });
    await Promise.resolve();
    a.clear();
    await Promise.resolve();
    expect(seen).toEqual(["signed-in", "signed-out"]);
    expect(b.getAccessToken()).toBeNull();
    expect(b.getRefreshToken()).toBeNull();
  });

  it("follows the storage event when there is no channel", () => {
    const store = createTokenStore({ openChannel: () => null });
    const seen = changesOf(store);
    store.setTokens({ accessToken: "a1", refreshToken: "r1" });

    window.localStorage.setItem(KEY, "r2");
    window.dispatchEvent(new StorageEvent("storage", { key: KEY, oldValue: "r1", newValue: "r2" }));
    // The access token belonged to r1: it is dropped so the next request renews with r2
    expect(store.getAccessToken()).toBeNull();
    expect(store.getRefreshToken()).toBe("r2");
    expect(seen).toEqual([]);

    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: KEY, oldValue: "r2", newValue: null }));
    expect(seen).toEqual(["signed-out"]);
  });

  it("ignores unrelated storage events", () => {
    const store = createTokenStore({ openChannel: () => null });
    store.setTokens({ accessToken: "a1", refreshToken: "r1" });
    window.dispatchEvent(new StorageEvent("storage", { key: "other", newValue: null }));
    expect(store.getAccessToken()).toBe("a1");
  });

  it("waits for a shared access token only up to the timeout", async () => {
    vi.useFakeTimers();
    const store = createTokenStore({ openChannel: () => null });
    const done = vi.fn();
    void store.waitForSharedAccessToken(300).then(done);
    await vi.advanceTimersByTimeAsync(299);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(done).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
