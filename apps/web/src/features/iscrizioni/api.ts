"use client";

import { useQueryClient } from "@tanstack/react-query";
import { api, useApiMutation, useApiQuery, type SessionResponse } from "@/lib/api";

export type JoinLinkStatus = "ACTIVE" | "EXPIRED" | "REVOKED" | "EXHAUSTED";

/** Enrolment link, as the administration sees it. Source of truth: apps/api/src/modules/enrolment/schema.ts. */
export interface JoinLink {
  id: string;
  code: string;
  /** The link to share: it opens the enrolment page. */
  url: string;
  label: string | null;
  team: { id: string; name: string; category: string | null } | null;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  status: JoinLinkStatus;
  createdAt: string;
}

export interface CreateJoinLinkBody {
  teamId?: string;
  label?: string;
  /** ISO date-time. */
  expiresAt?: string;
  maxUses?: number;
}

const JOIN_LINKS_KEY = ["join-links"] as const;

export function useJoinLinks(enabled: boolean) {
  return useApiQuery<{ data: JoinLink[] }>(JOIN_LINKS_KEY, "/join-links", { query: { limit: 100 }, enabled });
}

export function useCreateJoinLink() {
  const queryClient = useQueryClient();
  return useApiMutation((body: CreateJoinLinkBody, client) => client.post<JoinLink>("/join-links", body), {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: JOIN_LINKS_KEY }),
  });
}

export function useRevokeJoinLink() {
  const queryClient = useQueryClient();
  return useApiMutation((id: string, client) => client.delete<void>(`/join-links/${id}`), {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: JOIN_LINKS_KEY }),
  });
}

// ---- Public: the person who opens a link --------------------------------------------------------------------------

export interface JoinInfo {
  society: { name: string };
  team: { name: string; category: string | null } | null;
}

export function useJoinInfo(code: string) {
  return useApiQuery<JoinInfo>(["join-info", code], `/join/${code}`, { retry: false });
}

export interface EnrolBody {
  kind: "ATLETA" | "GENITORE";
  account: { email: string; password: string; firstName: string; lastName: string; phone?: string };
  athlete: {
    firstName?: string;
    lastName?: string;
    birthDate: string;
    gender?: "FEMALE" | "MALE";
    fiscalCode?: string;
    fieldRole?: string;
  };
  relation: "PADRE" | "MADRE" | "TUTORE" | "ALTRO";
}

export function enrol(code: string, body: EnrolBody): Promise<SessionResponse> {
  return api.post<SessionResponse>(`/join/${code}`, body, { auth: false });
}
