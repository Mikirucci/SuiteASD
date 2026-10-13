import type { Announcement, TeamOption } from "./types";

const STAMP = "2026-11-02T08:00:00.000Z";

export function announcement(overrides: Partial<Announcement> & Pick<Announcement, "id" | "title">): Announcement {
  return {
    body: "Il ritrovo è alle 19:00 davanti al Palazzetto.",
    teamId: null,
    teamName: null,
    isPinned: false,
    publishedAt: STAMP,
    status: "PUBLISHED",
    authorId: "u-admin",
    authorName: "Michele Rucci",
    createdAt: STAMP,
    updatedAt: STAMP,
    ...overrides,
  };
}

export const PINNED = announcement({
  id: "a-pinned",
  title: "Palestra chiusa sabato",
  body: "Sabato 14 novembre la palestra comunale è chiusa per la manutenzione del parquet.",
  isPinned: true,
});

export const TEAM_NOTICE = announcement({
  id: "a-u16",
  title: "Convocazione U16 per il torneo",
  teamId: "t-u16",
  teamName: "U16",
});

export const DRAFT = announcement({
  id: "a-draft",
  title: "Cena sociale di dicembre",
  publishedAt: null,
  status: "DRAFT",
});

export const SCHEDULED = announcement({
  id: "a-scheduled",
  title: "Iscrizioni aperte",
  publishedAt: "2027-01-10T08:00:00.000Z",
  status: "SCHEDULED",
});

export const LONG_NOTICE = announcement({
  id: "a-long",
  title: "Regolamento della trasferta",
  body: "Il pulmino parte dal Palazzetto un'ora e mezza prima della partita. ".repeat(6).trim(),
});

export const TEAMS: TeamOption[] = [
  { id: "t-u14", name: "U14" },
  { id: "t-u16", name: "U16" },
];
