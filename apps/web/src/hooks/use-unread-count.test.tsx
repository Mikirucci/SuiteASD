import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeApi } from "@/test/fake-api";
import { UNREAD_REFETCH_MS, useUnreadCount } from "./use-unread-count";

const COUNT = "GET /notifications/unread-count";

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useUnreadCount", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reads the counter once and refreshes it every minute", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let count = 2;
    const api = installFakeApi({ [COUNT]: () => ({ body: { count } }) });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(result.current.data?.count).toBe(2));
    expect(api.labels()).toEqual([COUNT]);

    count = 5;
    await vi.advanceTimersByTimeAsync(UNREAD_REFETCH_MS);
    await waitFor(() => expect(result.current.data?.count).toBe(5));
    expect(api.labels()).toEqual([COUNT, COUNT]);
  });

  it("sends no request while it is disabled", async () => {
    const api = installFakeApi({ [COUNT]: () => ({ body: { count: 1 } }) });
    const { result } = renderHook(() => useUnreadCount({ enabled: false }), { wrapper: wrapperFor(client) });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current.data).toBeUndefined();
    expect(api.calls).toHaveLength(0);
  });
});
