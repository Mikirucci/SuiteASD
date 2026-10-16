import type { Page, Route } from "@playwright/test";

/** Credentials the mocked backend understands. */
export const MOCK = {
  email: "presidente@aquilevolley.it",
  password: "una-password-valida",
  wrongPassword: "password-sbagliata",
  takenEmail: "esiste@aquilevolley.it",
} as const;

const SESSION = {
  accessToken: "access-token-1",
  refreshToken: "refresh-token-1",
  tokenType: "Bearer",
  expiresIn: 900,
  user: { id: "u1", email: MOCK.email, firstName: "Michele", lastName: "Rucci" },
  society: { id: "s1", name: "Aquile Volley" },
  roles: ["ADMIN"],
};

const ME = {
  user: { ...SESSION.user, phone: null },
  society: { ...SESSION.society, slug: "aquile-volley" },
  roles: ["ADMIN"],
  permissions: [],
  societies: [{ ...SESSION.society, roles: ["ADMIN"] }],
  member: null,
  children: [],
};

const CORS = {
  "access-control-allow-origin": "http://localhost:3000",
  "access-control-allow-headers": "authorization,content-type,idempotency-key",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
};

function problem(status: number, code: string, title: string, errors?: Array<{ path: string; message: string }>) {
  return { type: "about:blank", title, status, code, errors };
}

async function respond(route: Route, status: number, body?: unknown): Promise<void> {
  await route.fulfill({
    status,
    headers: { ...CORS, "content-type": status >= 400 ? "application/problem+json" : "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export interface MockApiState {
  /** Paths (with method) requested so far, e.g. "POST /auth/login". */
  calls: string[];
}

/**
 * Mocks the backend at network level: no real API needed for the UI tests.
 * Mirrors the contract of apps/api (auth module) including RFC 7807 errors.
 */
export async function mockApi(page: Page): Promise<MockApiState> {
  const state: MockApiState = { calls: [] };

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const path = new URL(request.url()).pathname.replace(/^\/api\/v1/, "");
    state.calls.push(`${request.method()} ${path}`);
    const body = request.postDataJSON() as Record<string, unknown> | null;

    switch (`${request.method()} ${path}`) {
      case "POST /auth/login":
        if (body?.password === MOCK.wrongPassword) {
          await respond(route, 401, problem(401, "unauthorized", "Unauthorized"));
        } else {
          await respond(route, 200, SESSION);
        }
        return;
      case "POST /auth/register": {
        const admin = body?.admin as { email?: string } | undefined;
        if (admin?.email === MOCK.takenEmail) {
          await respond(route, 409, problem(409, "email_taken", "Conflict"));
        } else {
          await respond(route, 201, SESSION);
        }
        return;
      }
      case "POST /auth/refresh":
        await respond(route, 200, { ...SESSION, accessToken: "access-token-2", refreshToken: "refresh-token-2" });
        return;
      case "GET /notifications/unread-count":
        // The navigation badge asks for it on every page; modules that care override it with routeApi
        await respond(route, 200, { count: 0 });
        return;
      case "POST /auth/logout":
        await respond(route, 204);
        return;
      case "GET /me":
        if (request.headers().authorization?.startsWith("Bearer ")) await respond(route, 200, ME);
        else await respond(route, 401, problem(401, "unauthorized", "Unauthorized"));
        return;
      default:
        await respond(route, 404, problem(404, "not_found", "Not Found"));
    }
  });

  return state;
}

/** Puts a refresh token in localStorage before the app loads: simulates a returning user. */
export async function seedStoredSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem("suiteasd.refreshToken", "refresh-token-1");
  });
}
