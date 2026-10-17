import { z } from "zod";
import type { Team } from "@/features/tesserati/types";

/** Wire types and form schema of the teams endpoints. Source of truth: apps/api/src/modules/teams/schema.ts. */

export type TeamGender = "FEMALE" | "MALE" | "MIXED";

export const TEAM_GENDER_LABEL: Record<TeamGender, string> = {
  FEMALE: "Femminile",
  MALE: "Maschile",
  MIXED: "Mista",
};

export const TEAM_GENDER_OPTIONS = (Object.keys(TEAM_GENDER_LABEL) as TeamGender[]).map((value) => ({
  value,
  label: TEAM_GENDER_LABEL[value],
}));

export function isTeamGender(value: string | null): value is TeamGender {
  return value === "FEMALE" || value === "MALE" || value === "MIXED";
}

export interface CreateTeamBody {
  name: string;
  category?: string;
  gender?: TeamGender;
  description?: string;
}

/** `null` clears an optional field. */
export interface UpdateTeamBody {
  name: string;
  category: string | null;
  gender: TeamGender | null;
  description: string | null;
}

export const teamFormSchema = z.object({
  name: z.string().trim().min(1, "Inserisci il nome della squadra").max(80, "Massimo 80 caratteri"),
  category: z.string().trim().max(40, "Massimo 40 caratteri"),
  gender: z.enum(["", "FEMALE", "MALE", "MIXED"]),
  description: z.string().trim().max(500, "Massimo 500 caratteri"),
});

export type TeamFormValues = z.infer<typeof teamFormSchema>;

export const TEAM_FORM_FIELDS = ["name", "category", "gender", "description"] as const;

export const EMPTY_TEAM_FORM: TeamFormValues = { name: "", category: "", gender: "", description: "" };

export function formValuesOf(team: Team): TeamFormValues {
  return {
    name: team.name,
    category: team.category ?? "",
    gender: isTeamGender(team.gender) ? team.gender : "",
    description: team.description ?? "",
  };
}

/** Empty optional fields are left out of a creation. */
export function toCreateBody(values: TeamFormValues): CreateTeamBody {
  return {
    name: values.name,
    ...(values.category ? { category: values.category } : {}),
    ...(values.gender ? { gender: values.gender } : {}),
    ...(values.description ? { description: values.description } : {}),
  };
}

/** Empty optional fields are sent as null so that clearing a field really clears it. */
export function toUpdateBody(values: TeamFormValues): UpdateTeamBody {
  return {
    name: values.name,
    category: values.category || null,
    gender: values.gender || null,
    description: values.description || null,
  };
}
