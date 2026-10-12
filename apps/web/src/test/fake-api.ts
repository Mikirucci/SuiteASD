import { vi } from "vitest";

export interface FakeRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

export interface FakeResponse {
  status?: number;
  body?: unknown;
}

export type FakeHandler = (request: FakeRequest) => FakeResponse | Promise<FakeResponse>;

/** Routes keyed by "METHOD /path" (path relative to the API base URL, no query string). */
export type FakeRoutes = Record<string, FakeHandler | FakeResponse>;

export function problem(status: number, code: string, errors?: Array<{ path: string; message: string }>) {
  return { status, body: { type: "about:blank", title: "Error", status, code, errors } };
}

export function pageOf<T>(data: T[]) {
  return { body: { data, page: { nextCursor: null, hasMore: false } } };
}

/**
 * Replaces `fetch` with a fake backend so feature tests exercise the real API client (URLs, JSON, RFC 7807 errors).
 * Returns the list of calls ("PUT /matches/m1/result") for assertions.
 */
export function installFakeApi(routes: FakeRoutes) {
  const calls: FakeRequest[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const method = init?.method ?? "GET";
    const request: FakeRequest = {
      method,
      path,
      query: url.searchParams,
      body: typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
    };
    calls.push(request);
    const route = routes[`${method} ${path}`];
    if (!route) return new Response(JSON.stringify({ title: "Not Found", status: 404, code: "not_found" }), { status: 404 });
    const answer = typeof route === "function" ? await route(request) : route;
    const status = answer.status ?? 200;
    return new Response(status === 204 || answer.body === undefined ? null : JSON.stringify(answer.body), {
      status,
      headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock, labels: () => calls.map((call) => `${call.method} ${call.path}`) };
}
