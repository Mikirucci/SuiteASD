const LOCK_NAME = "suiteasd.refresh";

/** Runs `task` while no other tab of the browser is renewing the session. */
export type RefreshLock = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * Serialises the renewal of the session across tabs with the Web Locks API. Where the API is missing (old browsers,
 * insecure contexts) the task runs straight away: tabs may then race, but each one still re-reads the refresh token
 * from storage first, and the backend tolerates a recently rotated token.
 */
export const browserRefreshLock: RefreshLock = async <T>(task: () => Promise<T>): Promise<T> => {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (!locks) return await task();
  return await locks.request(LOCK_NAME, task);
};
