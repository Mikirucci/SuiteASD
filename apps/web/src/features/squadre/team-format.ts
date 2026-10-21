import type { Team } from "@/features/tesserati/types";
import { TEAM_GENDER_LABEL, isTeamGender, type TeamGender } from "./team-schema";

export function genderLabelOf(team: Pick<Team, "gender">): string | null {
  return isTeamGender(team.gender) ? TEAM_GENDER_LABEL[team.gender] : null;
}

/** Colour of a team in the cards and in the gender filter; the gender is always written next to it. */
export interface TeamTone {
  /** Solid background of the stripe on the card. */
  tile: string;
  /** Tinted chip with the gender label. */
  chip: string;
  /** Small dot of the filter pill. */
  dot: string;
}

const TEAM_TONES: Record<TeamGender | "NONE", TeamTone> = {
  FEMALE: { tile: "bg-avatar-rose", chip: "bg-avatar-rose/10 text-avatar-rose", dot: "bg-avatar-rose" },
  MALE: { tile: "bg-avatar-blue", chip: "bg-avatar-blue/10 text-avatar-blue", dot: "bg-avatar-blue" },
  MIXED: { tile: "bg-avatar-emerald", chip: "bg-avatar-emerald/10 text-avatar-emerald", dot: "bg-avatar-emerald" },
  NONE: { tile: "bg-ink-700", chip: "bg-ink-100 text-ink-700", dot: "bg-ink-700" },
};

export function toneOfGender(gender: string | null): TeamTone {
  return isTeamGender(gender) ? TEAM_TONES[gender] : TEAM_TONES.NONE;
}

const startFormat = new Intl.DateTimeFormat("it-IT", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "sab 14 nov, 20:30". */
export function formatEventStart(iso: string): string {
  return startFormat.format(new Date(iso));
}
