"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { useAllPages } from "@/lib/use-all-pages";
import type { CreatePromotionBody, Promotion, PromotionCard, UpdatePromotionBody } from "./types";

/** Every promotion of the society, drafts and archived ones included: a club has a handful. */
export function usePromotions() {
  return useAllPages<Promotion>(["promotions", "manage"], "/promotions");
}

/** The cards of the signed-in user: a person has few, so the answer has no pages. */
export function useMyCards() {
  return useApiQuery<{ data: PromotionCard[] }>(["promotions", "mine"], "/me/promotions");
}

function useRefreshPromotions() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["promotions"] });
}

export function useCreatePromotion() {
  const refresh = useRefreshPromotions();
  return useApiMutation((body: CreatePromotionBody, client) => client.post<Promotion>("/promotions", body), {
    onSuccess: refresh,
  });
}

export function useUpdatePromotion(id: string) {
  const refresh = useRefreshPromotions();
  return useApiMutation((body: UpdatePromotionBody, client) => client.patch<Promotion>(`/promotions/${id}`, body), {
    onSuccess: refresh,
  });
}

export function usePublishPromotion() {
  const refresh = useRefreshPromotions();
  return useApiMutation((id: string, client) => client.post<Promotion>(`/promotions/${id}/publish`), { onSuccess: refresh });
}

export function useArchivePromotion() {
  const refresh = useRefreshPromotions();
  return useApiMutation((id: string, client) => client.post<Promotion>(`/promotions/${id}/archive`), { onSuccess: refresh });
}

export function useDeletePromotion() {
  const refresh = useRefreshPromotions();
  return useApiMutation((id: string, client) => client.delete<void>(`/promotions/${id}`), { onSuccess: refresh });
}
