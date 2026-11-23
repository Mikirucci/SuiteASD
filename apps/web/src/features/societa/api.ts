"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useApiMutation, useApiQuery } from "@/lib/api";

export type LegalForm = "ASD" | "SSD" | "APS" | "OTHER";

/** Fiscal and banking data: the server sends them only to the administrator and the segreteria. */
export interface SocietyLegal {
  legalName?: string;
  legalForm?: LegalForm;
  fiscalCode?: string;
  vatNumber?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  province?: string;
  pec?: string;
  sdiCode?: string;
  iban?: string;
  registryNumber?: string;
}

/** `GET /society`; a key the society has not filled in is absent. Source of truth: docs/api/CONTRATTO-PROFILO.md of the backend. */
export interface Society {
  id: string;
  name: string;
  slug: string;
  sport: string;
  timezone: string;
  phone?: string;
  contactEmail?: string;
  website?: string;
  /** Absent for whoever may not read the fiscal data. */
  legal?: SocietyLegal;
}

/** `PATCH /society`: a field left out stays as it is, `null` empties it. */
export interface SocietyPatch {
  name?: string;
  timezone?: string;
  phone?: string | null;
  contactEmail?: string | null;
  website?: string | null;
  legal?: Partial<Record<keyof SocietyLegal, string | null>>;
}

const SOCIETY_KEY = ["society"] as const;

export function useSociety() {
  return useApiQuery<Society>(SOCIETY_KEY, "/society");
}

export function useUpdateSociety() {
  const queryClient = useQueryClient();
  return useApiMutation((body: SocietyPatch, client) => client.patch<Society>("/society", body), {
    onSuccess: (society) => {
      queryClient.setQueryData(SOCIETY_KEY, society);
      // The name travels in the profile of the signed-in user (the menu, the cards) and the receipts
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
