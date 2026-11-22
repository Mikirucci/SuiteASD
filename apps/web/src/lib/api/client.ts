import { ApiError, NetworkError, parseProblem } from "./errors";
import { browserRefreshLock, type RefreshLock } from "./refresh-lock";
import type { TokenStore } from "./token-store";
import type { SessionResponse } from "./types";

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON body, serialised automatically. */
  /** JSON-serialised, except a Blob/File: it is sent as is with its own content type (file uploads). */
  body?: unknown;
  query?: QueryParams;
  signal?: AbortSignal;
  /** Sends the Bearer token and refreshes it on 401. Default true; false for public endpoints. */
  auth?: boolean;
  /** Required by the API for sensitive writes (payments, sends): reuse the same key when retrying. */
  idempotencyKey?: string;
  /** Media type the response may have; the API answers 406 to a PDF download that only accepts JSON. Default JSON. */
  accept?: string;
}

export interface DownloadedFile {
  blob: Blob;
  /** Name suggested by the server (Content-Disposition), or null. */
  filename: string | null;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
  /** GET a binary file (PDF...) with the Bearer token: a plain link cannot send the Authorization header. */
  download(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<DownloadedFile>;
  get<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T>;
  post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T>;
  put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T>;
  delete<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T>;
  /** Called when the refresh token is rejected: the user must log in again. Returns an unsubscribe function. */
  onSessionExpired(listener: () => void): () => void;
}

export interface ApiClientConfig {
  baseUrl: string;
  tokens: TokenStore;
  fetchImpl?: typeof fetch;
  /** Serialises session renewals across tabs. Default: the Web Locks API of the browser. */
  lock?: RefreshLock;
}

/** How long a tab that was waiting for the renewal lock waits for the access token the renewing tab shares. */
const SHARED_TOKEN_GRACE_MS = 300;

function buildUrl(baseUrl: string, path: string, query: QueryParams | undefined): string {
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function filenameOf(response: Response): string | null {
  const match = /filename="?([^";]+)"?/i.exec(response.headers.get("Content-Disposition") ?? "");
  return match?.[1] ?? null;
}

function retryAfterOf(response: Response): number | null {
  const header = response.headers.get("Retry-After");
  const seconds = header ? Number(header) : Number.NaN;
  return Number.isFinite(seconds) ? seconds : null;
}

export function createApiClient({ baseUrl, tokens, fetchImpl, lock = browserRefreshLock }: ApiClientConfig): ApiClient {
  const listeners = new Set<() => void>();
  let refreshing: Promise<void> | null = null;

  // Resolve fetch lazily so tests and SSR can stub it after the client is created
  const doFetch = (input: string, init: RequestInit): Promise<Response> => (fetchImpl ?? fetch)(input, init);

  async function send(path: string, options: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = { Accept: options.accept ?? "application/json" };
    if (options.body instanceof Blob) headers["Content-Type"] = options.body.type;
    else if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
    const accessToken = tokens.getAccessToken();
    if (options.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    try {
      return await doFetch(buildUrl(baseUrl, path, options.query), {
        method: options.method ?? "GET",
        headers,
        body: options.body instanceof Blob || options.body === undefined ? options.body : JSON.stringify(options.body),
        signal: options.signal,
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
      throw new NetworkError({ cause });
    }
  }

  async function toError(response: Response): Promise<ApiError> {
    return new ApiError(response.status, parseProblem(await readBody(response)), retryAfterOf(response));
  }

  /**
   * Renews the session. Concurrent 401s of this tab share one call (single flight); the tabs of the browser take turns
   * through the lock, and whoever comes second reuses what the first obtained instead of presenting the old refresh
   * token again, which the backend would read as theft and answer by revoking the whole session.
   * `staleAccessToken` is the one the failed request carried (null when there was none).
   */
  function refreshSession(staleAccessToken: string | null): Promise<void> {
    const refreshAtStart = tokens.getRefreshToken();
    refreshing ??= lock(() => renew(staleAccessToken, refreshAtStart))
      .catch((error: unknown) => {
        // A rejected refresh token ends the session; a network failure must not log the user out
        if (error instanceof ApiError) {
          tokens.clear();
          listeners.forEach((listener) => listener());
        }
        throw error;
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  function alreadyRenewed(staleAccessToken: string | null): boolean {
    const current = tokens.getAccessToken();
    return current !== null && current !== staleAccessToken;
  }

  /** Runs inside the lock. */
  async function renew(staleAccessToken: string | null, refreshAtStart: string | null): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      // Another tab may have renewed while we waited for the lock
      if (alreadyRenewed(staleAccessToken)) return;
      if (attempt === 0 && tokens.getRefreshToken() !== refreshAtStart) {
        // Its new access token may still be on its way
        await tokens.waitForSharedAccessToken(SHARED_TOKEN_GRACE_MS);
        if (alreadyRenewed(staleAccessToken)) return;
      }
      // Never a copy kept in memory: another tab may have rotated it
      const refreshToken = tokens.getRefreshToken();
      if (!refreshToken) throw new ApiError(401, null);
      const response = await send("/auth/refresh", { method: "POST", body: { refreshToken }, auth: false });
      if (response.ok) {
        const session = (await readBody(response)) as SessionResponse;
        tokens.setTokens({ accessToken: session.accessToken, refreshToken: session.refreshToken }, "refresh");
        return;
      }
      // Rejected, but a tab that does not use the lock may have rotated the token meanwhile: use the new one once
      if (attempt === 0 && tokens.getRefreshToken() !== refreshToken) continue;
      throw await toError(response);
    }
  }

  /** Sends the request (refreshing the session once on 401) and returns the successful response, or throws ApiError. */
  async function execute(path: string, options: RequestOptions): Promise<Response> {
    const authenticated = options.auth !== false;
    if (authenticated && !tokens.getAccessToken() && tokens.getRefreshToken()) await refreshSession(null);

    const sentWith = tokens.getAccessToken();
    let response = await send(path, options);
    if (response.status === 401 && authenticated && tokens.getRefreshToken()) {
      await refreshSession(sentWith);
      response = await send(path, options);
    }
    if (!response.ok) throw await toError(response);
    return response;
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return (await readBody(await execute(path, options))) as T;
  }

  async function download(
    path: string,
    options: Omit<RequestOptions, "method" | "body"> = {},
  ): Promise<DownloadedFile> {
    const response = await execute(path, { ...options, method: "GET", accept: "*/*" });
    return { blob: await response.blob(), filename: filenameOf(response) };
  }

  return {
    request,
    download,
    get: (path, options) => request(path, { ...options, method: "GET" }),
    post: (path, body, options) => request(path, { ...options, method: "POST", body }),
    put: (path, body, options) => request(path, { ...options, method: "PUT", body }),
    patch: (path, body, options) => request(path, { ...options, method: "PATCH", body }),
    delete: (path, options) => request(path, { ...options, method: "DELETE" }),
    onSessionExpired: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
