"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  authApi,
  api,
  isTwoFactorChallenge,
  type LoginBody,
  type MeResponse,
  type RegisterBody,
  type SessionResponse,
  type TwoFactorChallenge,
  type TwoFactorVerifyBody,
} from "@/lib/api";

type AuthState =
  | { status: "loading"; me: null }
  | { status: "unauthenticated"; me: null }
  | { status: "authenticated"; me: MeResponse };

export interface AuthContextValue {
  status: AuthState["status"];
  /** True when the user is signed out because the server ended their session (not because they logged out). */
  sessionExpired: boolean;
  /** Current user, society, roles and permissions: null unless authenticated. */
  me: MeResponse | null;
  /** Signs in, or returns the challenge when the account asks for the code of its app (nothing is signed in yet). */
  login(body: LoginBody): Promise<TwoFactorChallenge | null>;
  /** The second step of a sign-in: the code of the app or a recovery code. */
  verifyTwoFactor(body: TwoFactorVerifyBody): Promise<SessionResponse>;
  register(body: RegisterBody): Promise<void>;
  logout(): Promise<void>;
  /** Signs in with the session a public flow returned (enrolment with a link). */
  adoptSession(session: SessionResponse): Promise<void>;
  /** Reloads the user, the roles and the members they look after (after adding a child, for example). */
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: "loading", me: null });
  const [sessionExpired, setSessionExpired] = useState(false);

  // Restore the session after a reload: the stored refresh token is exchanged transparently by the client
  useEffect(() => {
    const controller = new AbortController();
    async function restore(): Promise<AuthState> {
      if (!authApi.hasStoredSession()) return { status: "unauthenticated", me: null };
      try {
        return { status: "authenticated", me: await authApi.me(controller.signal) };
      } catch {
        return { status: "unauthenticated", me: null };
      }
    }
    void restore().then((next) => {
      if (!controller.signal.aborted) setState(next);
    });
    return () => controller.abort();
  }, []);

  // A rejected refresh token ends the session wherever it happens
  useEffect(
    () =>
      api.onSessionExpired(() => {
        queryClient.clear();
        setSessionExpired(true);
        setState({ status: "unauthenticated", me: null });
      }),
    [queryClient],
  );

  // Another tab signed out (this one goes to /login) or signed in (this one picks up the new session)
  useEffect(() => {
    const controller = new AbortController();
    const unsubscribe = authApi.onOtherTabChange((change) => {
      if (change === "signed-out") {
        queryClient.clear();
        setState({ status: "unauthenticated", me: null });
        return;
      }
      void authApi.me(controller.signal).then(
        (me) => {
          if (controller.signal.aborted) return;
          queryClient.clear();
          setState({ status: "authenticated", me });
        },
        () => undefined,
      );
    });
    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [queryClient]);

  const login = useCallback(async (body: LoginBody) => {
    const result = await authApi.login(body);
    if (isTwoFactorChallenge(result)) return result;
    setSessionExpired(false);
    setState({ status: "authenticated", me: await authApi.me() });
    return null;
  }, []);

  const verifyTwoFactor = useCallback(
    async (body: TwoFactorVerifyBody) => {
      const session = await authApi.verifyTwoFactor(body);
      queryClient.clear();
      setSessionExpired(false);
      setState({ status: "authenticated", me: await authApi.me() });
      return session;
    },
    [queryClient],
  );

  const register = useCallback(async (body: RegisterBody) => {
    await authApi.register(body);
    setSessionExpired(false);
    setState({ status: "authenticated", me: await authApi.me() });
  }, []);

  const adoptSession = useCallback(
    async (session: SessionResponse) => {
      authApi.adoptSession(session);
      // Whatever was on screen belonged to the previous session
      queryClient.clear();
      setState({ status: "authenticated", me: await authApi.me() });
    },
    [queryClient],
  );

  const refresh = useCallback(async () => {
    setState({ status: "authenticated", me: await authApi.me() });
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setSessionExpired(false);
    queryClient.clear();
    setState({ status: "unauthenticated", me: null });
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ status: state.status, sessionExpired, me: state.me, login, verifyTwoFactor, register, logout, adoptSession, refresh }),
    [state, sessionExpired, login, verifyTwoFactor, register, logout, adoptSession, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
