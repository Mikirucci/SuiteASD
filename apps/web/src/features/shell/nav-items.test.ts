import { describe, expect, it } from "vitest";
import {
  ADMIN_ENTRIES,
  ADMIN_ITEMS,
  BOTTOM_BAR_ITEMS,
  findActiveItem,
  isActivePath,
  isNavGroup,
  visibleEntries,
  type NavEntry,
} from "./nav-items";

const ALL_PERMISSIONS = ADMIN_ITEMS.flatMap((item) => (item.permission ? [item.permission] : []));
/** What the ALLENATORE role gets from the matrix in apps/api/src/rbac/permissions.ts, limited to the menu permissions. */
const COACH_PERMISSIONS = [
  "members:read",
  "documents:read",
  "events:read",
  "attendance:read",
  "competitions:read",
  "evaluations:read",
  "notifications:readOwn",
  "kits:read",
  "venues:read",
  "trips:read",
  "announcements:read",
];

function labels(entries: readonly NavEntry[]): string[] {
  return entries.map((entry) => entry.label);
}

function group(entries: readonly NavEntry[], label: string) {
  const found = entries.find((entry) => entry.label === label);
  if (!found || !isNavGroup(found)) throw new Error(`"${label}" is not a group`);
  return found;
}

describe("administration menu", () => {
  it("is Home followed by five topic groups with their items in order", () => {
    expect(labels(ADMIN_ENTRIES)).toEqual(["Home", "Persone", "Attività sportiva", "Amministrazione", "Logistica", "Comunicazione"]);
    expect(group(ADMIN_ENTRIES, "Persone").items.map((item) => item.label)).toEqual(["Tesserati", "Squadre", "Staff", "Accessi e inviti"]);
    expect(group(ADMIN_ENTRIES, "Attività sportiva").items.map((item) => item.label)).toEqual([
      "Calendario",
      "Presenze",
      "Classifiche",
      "Tornei",
      "Pagelle",
      "Arbitri",
      "Statistiche",
    ]);
    expect(group(ADMIN_ENTRIES, "Amministrazione").items.map((item) => item.label)).toEqual(["Pagamenti", "Scadenze e documenti", "Bilancio", "Sponsor"]);
    expect(group(ADMIN_ENTRIES, "Logistica").items.map((item) => item.label)).toEqual(["Palestre", "Trasferte", "Divise"]);
    expect(group(ADMIN_ENTRIES, "Comunicazione").items.map((item) => item.label)).toEqual(["Notifiche", "Bacheca", "Automazioni"]);
  });

  it("keeps the URLs of the pages that already exist and points the new ones at /squadre and /inviti", () => {
    const hrefs = Object.fromEntries(ADMIN_ITEMS.map((item) => [item.id, item.href]));
    expect(hrefs).toMatchObject({
      squadre: "/squadre",
      inviti: "/inviti",
      staff: "/altro/staff",
      presenze: "/calendario/presenze",
      scadenze: "/scadenze",
      bilancio: "/altro/bilancio",
      automazioni: "/automazioni",
    });
    expect(new Set(ADMIN_ITEMS.map((item) => item.href)).size).toBe(ADMIN_ITEMS.length);
    expect(new Set(ADMIN_ITEMS.map((item) => item.id)).size).toBe(ADMIN_ITEMS.length);
  });

  it("asks a permission of every item but Home", () => {
    for (const item of ADMIN_ITEMS) {
      if (item.id === "home") expect(item.permission).toBeUndefined();
      else expect(item.permission, item.label).toMatch(/^[a-zA-Z]+:[a-zA-Z]+$/);
    }
  });

  it("keeps Home, Tesserati, Calendario and Quote on the bottom bar", () => {
    expect(BOTTOM_BAR_ITEMS.map((item) => item.label)).toEqual(["Home", "Tesserati", "Calendario", "Pagamenti"]);
  });
});

describe("visibleEntries", () => {
  it("shows the administrator every group and every item", () => {
    const entries = visibleEntries(ADMIN_ENTRIES, ALL_PERMISSIONS);
    expect(labels(entries)).toEqual(["Home", "Persone", "Attività sportiva", "Amministrazione", "Logistica", "Comunicazione"]);
    expect(entries.flatMap((entry) => (isNavGroup(entry) ? entry.items : [entry]))).toHaveLength(ADMIN_ITEMS.length);
  });

  it("hides from a coach what the permission matrix does not give", () => {
    const entries = visibleEntries(ADMIN_ENTRIES, COACH_PERMISSIONS);
    const shown = entries.flatMap((entry) => (isNavGroup(entry) ? entry.items : [entry])).map((item) => item.label);
    for (const hidden of ["Squadre", "Staff", "Accessi e inviti", "Pagamenti", "Bilancio", "Sponsor", "Arbitri", "Statistiche", "Automazioni"]) {
      expect(shown).not.toContain(hidden);
    }
    expect(group(entries, "Attività sportiva").items.map((item) => item.label)).toEqual(["Calendario", "Presenze", "Classifiche", "Tornei", "Pagelle"]);
    expect(group(entries, "Comunicazione").items.map((item) => item.label)).toEqual(["Notifiche", "Bacheca"]);
  });

  it("turns a group with a single visible item into a direct link to it", () => {
    const entries = visibleEntries(ADMIN_ENTRIES, COACH_PERMISSIONS);
    const persone = entries.find((entry) => entry.id === "tesserati");
    expect(persone && !isNavGroup(persone) && persone.href).toBe("/tesserati");
    const amministrazione = entries.find((entry) => entry.id === "scadenze");
    expect(amministrazione && !isNavGroup(amministrazione) && amministrazione.label).toBe("Scadenze e documenti");
    expect(labels(entries)).not.toContain("Persone");
    expect(labels(entries)).not.toContain("Amministrazione");
  });

  it("drops a group with nothing visible", () => {
    const entries = visibleEntries(ADMIN_ENTRIES, ["members:read", "events:read", "attendance:read"]);
    expect(labels(entries)).not.toContain("Logistica");
    expect(labels(entries)).not.toContain("Comunicazione");
    expect(labels(entries)).not.toContain("Amministrazione");
  });

  it("shows Squadre only to who can manage teams and Accessi e inviti only to who can invite", () => {
    const secretary = visibleEntries(ADMIN_ENTRIES, ["members:read", "teams:write", "invitations:write"]);
    expect(group(secretary, "Persone").items.map((item) => item.label)).toEqual(["Tesserati", "Squadre", "Accessi e inviti"]);
    const reader = visibleEntries(ADMIN_ENTRIES, ["members:read", "teams:read", "invitations:read"]);
    expect(labels(reader)).not.toContain("Persone");
  });

  it("leaves Home alone and shows nothing else to a user without permissions", () => {
    expect(labels(visibleEntries(ADMIN_ENTRIES, []))).toEqual(["Home"]);
  });
});

describe("findActiveItem", () => {
  it("picks the most specific item: Presenze, not Calendario, on /calendario/presenze", () => {
    expect(findActiveItem("/calendario/presenze", ADMIN_ENTRIES)?.label).toBe("Presenze");
    expect(findActiveItem("/calendario", ADMIN_ENTRIES)?.label).toBe("Calendario");
    expect(findActiveItem("/calendario/e1", ADMIN_ENTRIES)?.label).toBe("Calendario");
  });

  it("finds the pages that live under /altro and the home", () => {
    expect(findActiveItem("/altro/bilancio", ADMIN_ENTRIES)?.label).toBe("Bilancio");
    expect(findActiveItem("/", ADMIN_ENTRIES)?.label).toBe("Home");
  });

  it("finds nothing on a page that is not in the menu", () => {
    expect(findActiveItem("/sezione-inesistente", ADMIN_ENTRIES)).toBeUndefined();
  });
});

describe("isActivePath", () => {
  it("matches nested routes but not look-alike prefixes", () => {
    expect(isActivePath("/tesserati/42", "/tesserati")).toBe(true);
    expect(isActivePath("/tesserati-archivio", "/tesserati")).toBe(false);
    expect(isActivePath("/quote", "/")).toBe(false);
    expect(isActivePath("/", "/")).toBe(true);
  });
});
