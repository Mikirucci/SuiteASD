"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi, api, type LoginBody, type MeResponse, type RegisterBody, type SessionResponse } from "@/lib/api";

type AuthState =
  | { status: "loading"; me: null }
  | { status: "unauthenticated"; me: null }
  | { status: "authenticated"; me: MeResponse };

export interface AuthContextValue {
  status: AuthState["status"];
  /** Current user, society, roles and permissions: null unless authenticated. */
  me: MeResponse | null;
  login(body: LoginBody): Promise<void>;
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
        setState({ status: "unauthenticated", me: null });
      }),
    [queryClient],
  );

  const login = useCallback(async (body: LoginBody) => {
    await authApi.login(body);
    setState({ status: "authenticated", me: await authApi.me() });
  }, []);

  const register = useCallback(async (body: RegisterBody) => {
    await authApi.register(body);
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
    queryClient.clear();
    setState({ status: "unauthenticated", me: null });
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ status: state.status, me: state.me, login, register, logout, adoptSession, refresh }),
    [state, login, register, logout, adoptSession, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
