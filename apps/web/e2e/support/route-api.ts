import type { Page } from "@playwright/test";

const CORS = {
  "access-control-allow-origin": "http://localhost:3000",
  "access-control-allow-headers": "authorization,content-type,idempotency-key",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
};

export interface ApiRequest {
  method: string;
  /** Path relative to /api/v1, without query string. */
  path: string;
  query: URLSearchParams;
  body: unknown;
}

export interface ApiAnswer {
  status?: number;
  body?: unknown;
}

/** Answer for a request, or undefined to let the next handler (mockApi) deal with it. */
export type ApiHandler = (request: ApiRequest) => ApiAnswer | undefined;

export interface RoutedApi {
  /** Every request this handler answered, as "METHOD /path". */
  calls: string[];
  /** Bodies of the answered writes, by "METHOD /path". */
  bodies: Map<string, unknown>;
}

export function pageOf<T>(data: T[]): ApiAnswer {
  return { body: { data, page: { nextCursor: null, hasMore: false } } };
}

export interface MeOptions {
  permissions: string[];
  roles?: string[];
  member?: { id: string; firstName: string; lastName: string } | null;
  children?: Array<{ memberId: string; firstName: string; lastName: string; relation: string }>;
}

/** Body of GET /me with the given permissions (the shared mock returns none). */
export function meWith({ permissions, roles = ["ALLENATORE"], member = null, children = [] }: MeOptions) {
  const society = { id: "s1", name: "Aquile Volley" };
  return {
    user: { id: "u1", email: "allenatore@aquilevolley.it", firstName: "Michele", lastName: "Rucci", phone: null },
    society: { ...society, slug: "aquile-volley" },
    roles,
    permissions,
    societies: [{ ...society, roles }],
    member,
    children,
  };
}

/**
 * Registers a network-level handler for the module's endpoints. Call it AFTER `mockApi(page)`:
 * Playwright runs the latest route first and `fallback()` passes the rest (auth, preflight) to the shared mock.
 */
export async function routeApi(page: Page, me: MeOptions, handler: ApiHandler): Promise<RoutedApi> {
  const routed: RoutedApi = { calls: [], bodies: new Map() };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fallback();
      return;
    }
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const key = `${request.method()} ${path}`;
    const body = request.postDataJSON() as unknown;

    const answer: ApiAnswer | undefined =
      key === "GET /me" && request.headers().authorization?.startsWith("Bearer ")
        ? { body: meWith(me) }
        : handler({ method: request.method(), path, query: url.searchParams, body });
    if (!answer) {
      await route.fallback();
      return;
    }
    routed.calls.push(key);
    if (body !== null) routed.bodies.set(key, body);
    const status = answer.status ?? 200;
    await route.fulfill({
      status,
      headers: { ...CORS, "content-type": status >= 400 ? "application/problem+json" : "application/json" },
      body: status === 204 || answer.body === undefined ? undefined : JSON.stringify(answer.body),
    });
  });
  return routed;
}
