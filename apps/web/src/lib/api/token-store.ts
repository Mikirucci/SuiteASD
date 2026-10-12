const REFRESH_TOKEN_KEY = "suiteasd.refreshToken";

/**
 * Holds the session tokens.
 * - access token: memory only (short lived, never persisted, so it is not readable by other scripts)
 * - refresh token: localStorage, so the session survives a reload. Trade-off documented in docs/FRONTEND.md.
 */
export interface TokenStore {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  setTokens(tokens: { accessToken: string; refreshToken: string }): void;
  clear(): void;
}

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

export function createTokenStore(): TokenStore {
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  return {
    getAccessToken: () => accessToken,
    getRefreshToken: () => {
      if (refreshToken === null && typeof window !== "undefined") refreshToken = readStorage();
      return refreshToken;
    },
    setTokens: (tokens) => {
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;
      writeStorage(tokens.refreshToken);
    },
    clear: () => {
      accessToken = null;
      refreshToken = null;
      writeStorage(null);
    },
  };
}
