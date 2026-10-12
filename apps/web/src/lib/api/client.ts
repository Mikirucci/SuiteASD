import { ApiError, NetworkError, parseProblem } from "./errors";
import type { TokenStore } from "./token-store";
import type { SessionResponse } from "./types";

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON body, serialised automatically. */
  body?: unknown;
  query?: QueryParams;
  signal?: AbortSignal;
  /** Sends the Bearer token and refreshes it on 401. Default true; false for public endpoints. */
  auth?: boolean;
  /** Required by the API for sensitive writes (payments, sends): reuse the same key when retrying. */
  idempotencyKey?: string;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
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
}

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

function retryAfterOf(response: Response): number | null {
  const header = response.headers.get("Retry-After");
  const seconds = header ? Number(header) : Number.NaN;
  return Number.isFinite(seconds) ? seconds : null;
}

export function createApiClient({ baseUrl, tokens, fetchImpl }: ApiClientConfig): ApiClient {
  const listeners = new Set<() => void>();
  let refreshing: Promise<void> | null = null;

  // Resolve fetch lazily so tests and SSR can stub it after the client is created
  const doFetch = (input: string, init: RequestInit): Promise<Response> => (fetchImpl ?? fetch)(input, init);

  async function send(path: string, options: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
    const accessToken = tokens.getAccessToken();
    if (options.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;
    try {
      return await doFetch(buildUrl(baseUrl, path, options.query), {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
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

  /** Single flight: concurrent 401s share one refresh call, so the rotated token is used once. */
  function refreshSession(): Promise<void> {
    refreshing ??= (async () => {
      const refreshToken = tokens.getRefreshToken();
      if (!refreshToken) throw new ApiError(401, null);
      const response = await send("/auth/refresh", { method: "POST", body: { refreshToken }, auth: false });
      if (!response.ok) throw await toError(response);
      const session = (await readBody(response)) as SessionResponse;
      tokens.setTokens({ accessToken: session.accessToken, refreshToken: session.refreshToken });
    })()
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

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const authenticated = options.auth !== false;
    if (authenticated && !tokens.getAccessToken() && tokens.getRefreshToken()) await refreshSession();

    let response = await send(path, options);
    if (response.status === 401 && authenticated && tokens.getRefreshToken()) {
      await refreshSession();
      response = await send(path, options);
    }
    if (!response.ok) throw await toError(response);
    return (await readBody(response)) as T;
  }

  return {
    request,
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
