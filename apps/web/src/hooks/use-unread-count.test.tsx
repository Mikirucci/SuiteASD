import { QueryClient, QueryClientProvider, focusManager, useQuery } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { installFakeApi } from "@/test/fake-api";
import { NOTIFICATIONS_KEY, UNREAD_REFETCH_MS, useUnreadCount } from "./use-unread-count";

const COUNT = "GET /notifications/unread-count";

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("useUnreadCount", () => {
  let client: QueryClient;

  beforeEach(() => {
    // Same defaults as the app (providers.tsx): focus refetching is off unless a query asks for it
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false } } });
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

  it("reads the counter again as soon as the person comes back to the window", async () => {
    let count = 0;
    const fake = installFakeApi({ [COUNT]: () => ({ body: { count } }) });
    const { result } = renderHook(() => useUnreadCount(), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(result.current.data?.count).toBe(0));

    count = 3;
    focusManager.setFocused(false);
    focusManager.setFocused(true);

    await waitFor(() => expect(result.current.data?.count).toBe(3));
    expect(fake.labels()).toEqual([COUNT, COUNT]);
    focusManager.setFocused(undefined);
  });

  it("refreshes the lists of notifications when the counter changes, and only then", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let count = 1;
    let listReads = 0;
    installFakeApi({
      [COUNT]: () => ({ body: { count } }),
      "GET /notifications": () => {
        listReads += 1;
        return { body: { data: [], page: { nextCursor: null, hasMore: false } } };
      },
    });
    const { result } = renderHook(
      () => {
        const counter = useUnreadCount();
        const list = useQuery({
          queryKey: [...NOTIFICATIONS_KEY, "list"],
          queryFn: ({ signal }) => api.get<unknown>("/notifications", { signal }),
        });
        return { counter, list };
      },
      { wrapper: wrapperFor(client) },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    expect(listReads).toBe(1);

    await vi.advanceTimersByTimeAsync(UNREAD_REFETCH_MS);
    await waitFor(() => expect(result.current.counter.isFetching).toBe(false));
    expect(listReads).toBe(1);

    count = 2;
    await vi.advanceTimersByTimeAsync(UNREAD_REFETCH_MS);
    await waitFor(() => expect(listReads).toBe(2));
  });
});
