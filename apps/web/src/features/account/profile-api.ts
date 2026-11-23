"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useApiMutation, useApiQuery } from "@/lib/api";

/** A qualification of somebody who works for the society (a coaching licence, a first-aid course...). */
export interface Qualification {
  id: string;
  title: string;
  /** Calendar day, "YYYY-MM-DD". */
  issuedOn?: string;
  expiresOn?: string;
}

/**
 * The personal data of the signed-in person, as `GET /me/profile` gives them: a key the person has not filled is
 * absent. `iban` and `qualifications` are sent only to those who work for the society (`profile:professional`).
 * Source of truth: the backend (docs/api/CONTRATTO-PROFILO.md).
 */
export interface MyProfile {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  birthDate?: string;
  birthPlace?: string;
  fiscalCode?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  iban?: string;
  memberId?: string;
  /** Fields already on the member card that an athlete can only add to, never change. */
  fixedFields: Array<"fiscalCode" | "birthDate" | "birthPlace">;
  qualifications?: Qualification[];
}

/** Fields of `PATCH /me/profile`: one absent is left as it is, `null` empties it. */
export type ProfilePatch = Partial<Record<"phone" | "birthDate" | "birthPlace" | "fiscalCode" | "address" | "city" | "postalCode" | "iban", string | null>>;

export interface QualificationBody {
  title: string;
  issuedOn?: string | null;
  expiresOn?: string | null;
}

export interface EmergencyContact {
  id: string;
  name: string;
  relation?: string;
  phone: string;
}

export interface EmergencyContactBody {
  name: string;
  relation?: string;
  phone: string;
}

const PROFILE_KEY = ["me", "profile"] as const;

export function useMyProfile(enabled = true) {
  return useApiQuery<MyProfile>(PROFILE_KEY, "/me/profile", { enabled });
}

function useRefreshProfile() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
}

export function usePatchMyProfile() {
  const queryClient = useQueryClient();
  return useApiMutation((body: ProfilePatch, client) => client.patch<MyProfile>("/me/profile", body), {
    onSuccess: (profile) => queryClient.setQueryData(PROFILE_KEY, profile),
  });
}

export function useAddQualification() {
  const refresh = useRefreshProfile();
  return useApiMutation((body: QualificationBody, client) => client.post<Qualification>("/me/qualifications", body), { onSuccess: refresh });
}

export function useReplaceQualification(id: string) {
  const refresh = useRefreshProfile();
  return useApiMutation((body: QualificationBody, client) => client.put<Qualification>(`/me/qualifications/${id}`, body), { onSuccess: refresh });
}

export function useDeleteQualification() {
  const refresh = useRefreshProfile();
  return useApiMutation((id: string, client) => client.delete<void>(`/me/qualifications/${id}`), { onSuccess: refresh });
}

export function useEmergencyContacts(memberId: string) {
  return useApiQuery<{ data: EmergencyContact[] }>(["members", memberId, "emergency-contacts"], `/members/${memberId}/emergency-contacts`);
}

function useRefreshContacts(memberId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["members", memberId, "emergency-contacts"] });
}

export function useAddEmergencyContact(memberId: string) {
  const refresh = useRefreshContacts(memberId);
  return useApiMutation(
    (body: EmergencyContactBody, client) => client.post<EmergencyContact>(`/members/${memberId}/emergency-contacts`, body),
    { onSuccess: refresh },
  );
}

export function useReplaceEmergencyContact(memberId: string, id: string) {
  const refresh = useRefreshContacts(memberId);
  return useApiMutation(
    (body: EmergencyContactBody, client) => client.put<EmergencyContact>(`/members/${memberId}/emergency-contacts/${id}`, body),
    { onSuccess: refresh },
  );
}

export function useDeleteEmergencyContact(memberId: string) {
  const refresh = useRefreshContacts(memberId);
  return useApiMutation((id: string, client) => client.delete<void>(`/members/${memberId}/emergency-contacts/${id}`), { onSuccess: refresh });
}
