import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { ToastProvider } from "@/components/ui";

/** Network stub at fetch level and provider wrapper shared by the feature test suites. */

export function page<T>(data: T[], nextCursor: string | null = null) {
  return { data, page: { nextCursor, hasMore: nextCursor !== null } };
}

export function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": status >= 400 ? "application/problem+json" : "application/json" },
  });
}

export function problem(status: number, code: string, title = "Error"): Response {
  return json(status, { type: "about:blank", title, status, code });
}

export interface RecordedCall {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: unknown;
}

type Handler = (call: RecordedCall) => Response | Promise<Response>;

/** Replaces `fetch` with a router keyed "METHOD /path" (without /api/v1); unknown routes answer 404. */
export function stubApi(routes: Record<string, Handler>): { calls: RecordedCall[]; count: (key: string) => number } {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      const call: RecordedCall = {
        method: init.method ?? "GET",
        path: url.pathname.replace(/^\/api\/v1/, ""),
        query: url.searchParams,
        headers: (init.headers ?? {}) as Record<string, string>,
        body: typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : init.body,
      };
      calls.push(call);
      const handler = routes[`${call.method} ${call.path}`];
      return handler ? handler(call) : problem(404, "not_found", "Not Found");
    }),
  );
  return {
    calls,
    count: (key) => calls.filter((call) => `${call.method} ${call.path}` === key).length,
  };
}

export function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}
