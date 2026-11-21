import { useMemo, useSyncExternalStore } from "react";

/**
 * A stand-in for `next/navigation` whose address really changes: `router.replace` updates the path and the query, and
 * every page that reads them renders again. Use it with
 * `vi.mock("next/navigation", async () => (await import("@/test/fake-navigation")).fakeNavigation)`.
 */
const ORIGIN = "http://localhost";
let current = new URL("/", ORIGIN);
const listeners = new Set<() => void>();
const replaced: string[] = [];

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function go(href: string): void {
  current = new URL(href, ORIGIN);
  for (const listener of listeners) listener();
}

export const address = {
  /** Opens a page, as arriving on it does. */
  open: (href: string) => {
    replaced.length = 0;
    go(href);
  },
  /** Path and query now. */
  get href(): string {
    return `${current.pathname}${current.search}`;
  },
  /** Every address the page moved to with `router.replace`, oldest first. */
  get replaced(): readonly string[] {
    return replaced;
  },
};

export const fakeNavigation = {
  usePathname: () => useSyncExternalStore(subscribe, () => current.pathname, () => current.pathname),
  useSearchParams: () => {
    const search = useSyncExternalStore(subscribe, () => current.search, () => current.search);
    return useMemo(() => new URLSearchParams(search), [search]);
  },
  useRouter: () => ({
    replace: (href: string) => {
      replaced.push(href);
      go(href);
    },
    push: (href: string) => go(href),
  }),
};
