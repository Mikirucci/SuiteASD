import type { ApiClient } from "./client";
import type { TokenStore } from "./token-store";
import type { LoginBody, MeResponse, RegisterBody, SessionResponse } from "./types";

export interface AuthApi {
  register(body: RegisterBody): Promise<SessionResponse>;
  login(body: LoginBody): Promise<SessionResponse>;
  /** Revokes the refresh token on the server (best effort) and forgets the session locally. */
  logout(): Promise<void>;
  me(signal?: AbortSignal): Promise<MeResponse>;
  /** Starts the session a public flow returned (enrolment with a link): the person is signed in. */
  adoptSession(session: SessionResponse): void;
  hasStoredSession(): boolean;
}

export function createAuthApi(client: ApiClient, tokens: TokenStore): AuthApi {
  async function startSession(promise: Promise<SessionResponse>): Promise<SessionResponse> {
    const session = await promise;
    tokens.setTokens({ accessToken: session.accessToken, refreshToken: session.refreshToken });
    return session;
  }

  return {
    register: (body) => startSession(client.post<SessionResponse>("/auth/register", body, { auth: false })),
    login: (body) => startSession(client.post<SessionResponse>("/auth/login", body, { auth: false })),
    logout: async () => {
      const refreshToken = tokens.getRefreshToken();
      tokens.clear();
      if (!refreshToken) return;
      try {
        await client.post<void>("/auth/logout", { refreshToken }, { auth: false });
      } catch {
        // The session is already gone locally; an unreachable server must not block logout
      }
    },
    me: (signal) => client.get<MeResponse>("/me", { signal }),
    adoptSession: (session) => tokens.setTokens({ accessToken: session.accessToken, refreshToken: session.refreshToken }),
    hasStoredSession: () => tokens.getRefreshToken() !== null,
  };
}
