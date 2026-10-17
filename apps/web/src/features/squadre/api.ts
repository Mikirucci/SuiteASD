"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { Team } from "@/features/tesserati/types";
import { useApiMutation } from "@/lib/api";
import { useCursorQuery } from "@/lib/use-cursor-query";
import type { CreateTeamBody, UpdateTeamBody } from "./team-schema";

const PAGE_SIZE = 25;

/** Teams for the management page, with "load more". Keyed under "teams" so any team write refreshes every list. */
export function useTeamsPage() {
  return useCursorQuery<Team>(["teams", "manage"], "/teams", { limit: PAGE_SIZE });
}

/** Teams feed the member filters and forms, and the member counts: refresh them all after a write. */
function useInvalidateTeams() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["teams"] }),
      queryClient.invalidateQueries({ queryKey: ["members"] }),
    ]);
  };
}

export function useCreateTeam() {
  const invalidate = useInvalidateTeams();
  return useApiMutation((body: CreateTeamBody, client) => client.post<Team>("/teams", body), { onSuccess: invalidate });
}

export function useUpdateTeam(id: string) {
  const invalidate = useInvalidateTeams();
  return useApiMutation((body: UpdateTeamBody, client) => client.patch<Team>(`/teams/${id}`, body), {
    onSuccess: invalidate,
  });
}

export function useDeleteTeam() {
  const invalidate = useInvalidateTeams();
  return useApiMutation((id: string, client) => client.delete<void>(`/teams/${id}`), { onSuccess: invalidate });
}
