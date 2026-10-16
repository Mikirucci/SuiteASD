import { CHANNELS, NOTIFICATION_TYPES } from "./catalog";

/** The types of the organisation audience: what the API lists to the administration instead of the personal ones. */
export const ORGANISATION_TYPES: readonly NotificationPreference["type"][] = NOTIFICATION_TYPES.filter((type) => type.startsWith("ADMIN_"));
import type { AppNotification, NotificationPreference } from "./types";

/** Fixtures shared by the Vitest component tests and the Playwright spec. */

export function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "n-fee",
    type: "FEE_DUE",
    title: "Quota in scadenza",
    body: "Quota novembre · € 60 · scade il 10 novembre (tra 3 giorni)",
    readAt: null,
    createdAt: "2026-11-07T08:00:00.000Z",
    ...overrides,
  };
}

export const CONVOCATION = notification({
  id: "n-conv",
  type: "CONVOCATION",
  title: "Convocazione",
  body: "U16 vs Delfini Volley · Sabato 18:00 · conferma presenza",
  createdAt: "2026-11-08T09:30:00.000Z",
});

export const FEE_UNREAD = notification();

export const EVALUATION_READ = notification({
  id: "n-eval",
  type: "EVALUATION_PUBLISHED",
  title: "Pagella pubblicata",
  body: "Aquile 3-1 Delfini · voto 8,5",
  readAt: "2026-11-06T10:00:00.000Z",
  createdAt: "2026-11-05T20:00:00.000Z",
});

export const ALL_NOTIFICATIONS: AppNotification[] = [CONVOCATION, FEE_UNREAD, EVALUATION_READ];

/** Every (type, channel) pair of the personal types (organisation ones when asked), enabled unless in `off` as "TYPE:CHANNEL". */
export function preferences(off: readonly string[] = [], audience: "personal" | "organisation" = "personal"): NotificationPreference[] {
  const types = NOTIFICATION_TYPES.filter((type) => type.startsWith("ADMIN_") === (audience === "organisation"));
  return types.flatMap((type) =>
    CHANNELS.map((channel) => ({ type, channel, enabled: !off.includes(`${type}:${channel}`) })),
  );
}
