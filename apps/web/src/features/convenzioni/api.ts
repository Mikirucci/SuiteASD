"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { api, ApiError, useApiMutation, useApiQuery } from "@/lib/api";
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

/**
 * The logo of the society as an address the browser can show: the image needs the token, so it is fetched as a blob.
 * `null` while it loads and for a society without a logo.
 */
export function useSocietyLogoUrl(enabled: boolean): string | null {
  const logo = useQuery<Blob | null, ApiError>({
    queryKey: ["promotions", "logo"],
    enabled,
    queryFn: async () => {
      try {
        return (await api.download("/me/promotions/society-logo")).blob;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });
  const url = useMemo(() => (logo.data ? URL.createObjectURL(logo.data) : null), [logo.data]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
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

/** Sets or replaces the logo: the image is the body of the request, as it is. */
export function useUploadSocietyLogo() {
  const refresh = useRefreshPromotions();
  return useApiMutation((file: File, client) => client.put<void>("/promotions/society-logo", file), { onSuccess: refresh });
}

export function useRemoveSocietyLogo() {
  const refresh = useRefreshPromotions();
  return useApiMutation((_: void, client) => client.delete<void>("/promotions/society-logo"), { onSuccess: refresh });
}
