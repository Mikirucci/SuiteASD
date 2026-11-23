"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useApiMutation, type Role } from "@/lib/api";
import { useCursorQuery } from "@/lib/use-cursor-query";

/** A person who can sign in to the society, as `GET /users` describes them. Source of truth: the backend. */
export interface Account {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  /** False when the society disabled the person: they cannot sign in here, their data stays. */
  isActive: boolean;
  roles: Role[];
  emailVerified?: boolean;
  createdAt: string;
  /** Last sign-in in any society, or null when they never signed in. */
  lastLoginAt: string | null;
  member: { id: string; firstName: string; lastName: string } | null;
}

export type AuditAction = "ROLES_CHANGED" | "DEACTIVATED" | "REACTIVATED" | "REMOVED";

export interface AuditEntry {
  id: string;
  actorId: string | null;
  /** Null when the account of who did it no longer exists. */
  actorName: string | null;
  action: AuditAction;
  rolesBefore: Role[];
  rolesAfter: Role[];
  createdAt: string;
}

const ACCOUNTS_KEY = ["users"] as const;
const PAGE_SIZE = 25;

export function useAccounts(enabled: boolean) {
  return useCursorQuery<Account>(ACCOUNTS_KEY, "/users", { limit: PAGE_SIZE }, { enabled });
}

export function useAccountAudit(id: string, enabled: boolean) {
  return useCursorQuery<AuditEntry>(["users", id, "audit"], `/users/${id}/audit`, { limit: PAGE_SIZE }, { enabled });
}

function useRefreshAccounts() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
}

/** The roles sent replace the ones the person has. */
export function useChangeRoles(id: string) {
  const refresh = useRefreshAccounts();
  return useApiMutation((roles: Role[], client) => client.put<Account>(`/users/${id}/roles`, { roles }), { onSuccess: refresh });
}

export function useDeactivateAccount() {
  const refresh = useRefreshAccounts();
  return useApiMutation((id: string, client) => client.post<Account>(`/users/${id}/deactivate`), { onSuccess: refresh });
}

export function useReactivateAccount() {
  const refresh = useRefreshAccounts();
  return useApiMutation((id: string, client) => client.post<Account>(`/users/${id}/reactivate`), { onSuccess: refresh });
}

/** Takes the person out of the society: their data stays, the access goes. */
export function useRemoveAccount() {
  const refresh = useRefreshAccounts();
  return useApiMutation((id: string, client) => client.delete<void>(`/users/${id}`), { onSuccess: refresh });
}
