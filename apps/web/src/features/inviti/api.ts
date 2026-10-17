"use client";

import { useQueryClient } from "@tanstack/react-query";
import { api, useApiMutation, useApiQuery, type Role, type SessionResponse } from "@/lib/api";
import { useCursorQuery } from "@/lib/use-cursor-query";
import type { CreateInvitationBody, CreatedInvitation, Invitation } from "./invitation-format";

const INVITATIONS_KEY = ["invitations"] as const;
const PAGE_SIZE = 25;

/** Pending invitations: the API lists only the ones that are neither accepted, revoked nor expired. */
export function usePendingInvitations(enabled: boolean) {
  return useCursorQuery<Invitation>(INVITATIONS_KEY, "/invitations", { limit: PAGE_SIZE }, { enabled });
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();
  return useApiMutation((body: CreateInvitationBody, client) => client.post<CreatedInvitation>("/invitations", body), {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY }),
  });
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient();
  return useApiMutation((id: string, client) => client.delete<void>(`/invitations/${id}`), {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY }),
  });
}

// ---- Public: the person who opens the link ------------------------------------------------------------------------

/** What the link is for. Source of truth: apps/api/src/modules/auth/schema.ts (`invitationInfoSchema`). */
export interface InvitationInfo {
  society: { name: string };
  role: Role;
  /** The invited email with most of it hidden, e.g. "m***@example.test". */
  maskedEmail: string;
}

export function useInvitationInfo(token: string) {
  return useApiQuery<InvitationInfo>(["invitation-info", token], `/invitations/${encodeURIComponent(token)}`, { retry: false });
}

export interface AcceptInvitationBody {
  token: string;
  password: string;
  /** Needed only when the invited email has no account yet. */
  firstName?: string;
  lastName?: string;
}

export function acceptInvitation(body: AcceptInvitationBody): Promise<SessionResponse> {
  return api.post<SessionResponse>("/invitations/accept", body, { auth: false });
}
