const REFRESH_TOKEN_KEY = "suiteasd.refreshToken";
const CHANNEL_NAME = "suiteasd.session";

/** What happened to the session in ANOTHER tab of the same browser. */
export type SessionChange = "signed-in" | "signed-out";

/** How a token pair came to be: a person signing in, or a silent renewal of the access token. */
export type TokenOrigin = "login" | "refresh";

/**
 * Holds the session tokens.
 * - access token: memory only (short lived, never persisted, so it is not readable by other scripts)
 * - refresh token: localStorage, so the session survives a reload and is shared by the tabs of the browser.
 *   Trade-off documented in docs/FRONTEND.md.
 *
 * The backend rotates the refresh token on every renewal and revokes the whole session if an old one comes back, so
 * tabs must never renew with a stale copy: the refresh token is always read from storage, and a renewal done by a tab
 * is announced to the others (storage event + BroadcastChannel carrying the new access token).
 */
export interface TokenStore {
  getAccessToken(): string | null;
  /** Always the value in storage (another tab may have rotated it); memory is only a fallback when storage is blocked. */
  getRefreshToken(): string | null;
  setTokens(tokens: { accessToken: string; refreshToken: string }, origin?: TokenOrigin): void;
  clear(): void;
  /** Listens to sign-in and sign-out done in other tabs. Returns an unsubscribe function. */
  subscribe(listener: (change: SessionChange) => void): () => void;
  /**
   * Resolves as soon as another tab shares an access token, or after `timeoutMs`. Used right after a renewal lock is
   * granted, when the tab that renewed may not have delivered its access token yet.
   */
  waitForSharedAccessToken(timeoutMs: number): Promise<void>;
}

/** The part of BroadcastChannel the store uses; tests replace it with an in-memory bus. */
export interface ChannelLike {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  close(): void;
}

export interface TokenStoreOptions {
  /** Opens the channel to the other tabs; null when the browser has none. Default: BroadcastChannel. */
  openChannel?: () => ChannelLike | null;
}

type Message = { type: "tokens"; accessToken: string; refreshToken: string; origin: TokenOrigin } | { type: "cleared" };

function readStorage(): string | null {
  try {
    return window.localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    else window.localStorage.setItem(REFRESH_TOKEN_KEY, value);
  } catch {
    // Storage can be unavailable (private mode, blocked cookies): the session then lasts until reload.
  }
}

function defaultOpenChannel(): ChannelLike | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL_NAME);
}

function isMessage(data: unknown): data is Message {
  if (typeof data !== "object" || data === null || !("type" in data)) return false;
  if (data.type === "cleared") return true;
  return (
    data.type === "tokens" &&
    "accessToken" in data &&
    typeof data.accessToken === "string" &&
    "refreshToken" in data &&
    typeof data.refreshToken === "string"
  );
}

export function createTokenStore(options: TokenStoreOptions = {}): TokenStore {
  let accessToken: string | null = null;
  /** The refresh token the access token was issued together with: tells whether storage moved on without us. */
  let accessPairedWith: string | null = null;
  /** Memory fallback for when storage is blocked. */
  let memoryRefreshToken: string | null = null;
  const listeners = new Set<(change: SessionChange) => void>();
  const sharedWaiters = new Set<() => void>();
  const channel = typeof window === "undefined" ? null : (options.openChannel ?? defaultOpenChannel)();

  const notify = (change: SessionChange) => listeners.forEach((listener) => listener(change));

  function currentRefreshToken(): string | null {
    return readStorage() ?? memoryRefreshToken;
  }

  function applySignedOut(): void {
    const hadSession = currentRefreshToken() !== null || accessToken !== null;
    accessToken = null;
    accessPairedWith = null;
    memoryRefreshToken = null;
    if (hadSession) notify("signed-out");
  }

  function applyTokens(message: Extract<Message, { type: "tokens" }>): void {
    const hadSession = accessToken !== null || memoryRefreshToken !== null;
    accessToken = message.accessToken;
    accessPairedWith = message.refreshToken;
    memoryRefreshToken = message.refreshToken;
    sharedWaiters.forEach((resolve) => resolve());
    if (message.origin === "login" || !hadSession) notify("signed-in");
  }

  if (channel) {
    channel.addEventListener("message", (event) => {
      if (!isMessage(event.data)) return;
      if (event.data.type === "cleared") applySignedOut();
      else applyTokens(event.data);
    });
  }

  // Fallback for browsers without BroadcastChannel, and the way a logout is noticed even if the message got lost.
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key !== REFRESH_TOKEN_KEY) return;
      if (event.newValue === null) {
        applySignedOut();
        return;
      }
      memoryRefreshToken = event.newValue;
      // The access token we hold belongs to an older refresh token. If the channel does not deliver the new one, the
      // next request renews with the stored (current) refresh token, which is always safe.
      if (accessPairedWith !== event.newValue) {
        const wasSignedOut = accessToken === null && accessPairedWith === null && event.oldValue === null;
        accessToken = null;
        accessPairedWith = null;
        if (wasSignedOut) notify("signed-in");
      }
    });
  }

  return {
    getAccessToken: () => accessToken,
    getRefreshToken: currentRefreshToken,
    setTokens: (tokens, origin = "login") => {
      accessToken = tokens.accessToken;
      accessPairedWith = tokens.refreshToken;
      memoryRefreshToken = tokens.refreshToken;
      writeStorage(tokens.refreshToken);
      channel?.postMessage({ type: "tokens", ...tokens, origin } satisfies Message);
    },
    clear: () => {
      accessToken = null;
      accessPairedWith = null;
      memoryRefreshToken = null;
      writeStorage(null);
      channel?.postMessage({ type: "cleared" } satisfies Message);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    waitForSharedAccessToken: (timeoutMs) =>
      new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          sharedWaiters.delete(done);
          resolve();
        };
        const timer = setTimeout(done, timeoutMs);
        sharedWaiters.add(done);
      }),
  };
}
