import type { ApiClient } from "./client";
import type { SessionChange, TokenStore } from "./token-store";
import { isTwoFactorChallenge, type LoginBody, type MeResponse, type RegisterBody, type SessionResponse, type SignInResult, type TwoFactorVerifyBody } from "./types";

export interface AuthApi {
  register(body: RegisterBody): Promise<SessionResponse>;
  /** Starts the session, unless the account asks for the code of its app: then nothing is stored yet. */
  login(body: LoginBody): Promise<SignInResult>;
  /** The second step: the code of the app (or a recovery code) for the challenge the sign-in returned. */
  verifyTwoFactor(body: TwoFactorVerifyBody): Promise<SessionResponse>;
  /** Revokes the refresh token on the server (best effort) and forgets the session locally. */
  logout(): Promise<void>;
  me(signal?: AbortSignal): Promise<MeResponse>;
  /** Starts the session a public flow returned (enrolment with a link): the person is signed in. */
  adoptSession(session: SessionResponse): void;
  hasStoredSession(): boolean;
  /** Another tab of the browser signed in or out: this one must follow. Returns an unsubscribe function. */
  onOtherTabChange(listener: (change: SessionChange) => void): () => void;
}

export function createAuthApi(client: ApiClient, tokens: TokenStore): AuthApi {
  async function startSession(promise: Promise<SessionResponse>): Promise<SessionResponse> {
    const session = await promise;
    tokens.setTokens({ accessToken: session.accessToken, refreshToken: session.refreshToken });
    return session;
  }

  return {
    register: (body) => startSession(client.post<SessionResponse>("/auth/register", body, { auth: false })),
    login: async (body) => {
      const result = await client.post<SignInResult>("/auth/login", body, { auth: false });
      if (isTwoFactorChallenge(result)) return result;
      tokens.setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
      return result;
    },
    verifyTwoFactor: (body) => startSession(client.post<SessionResponse>("/auth/2fa/verify", body, { auth: false })),
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
    onOtherTabChange: (listener) => tokens.subscribe(listener),
  };
}
