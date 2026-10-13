import type { Page } from "@playwright/test";
import type { DocumentIndicator, MemberDetail, MemberListItem, Team } from "../../src/features/tesserati/types";
import { mockApi, seedStoredSession } from "./mock-api";

/** Network-level fixtures for the members (01) and expirations (02) modules. The backend is never needed. */

const CORS = {
  "access-control-allow-origin": "http://localhost:3000",
  "access-control-allow-headers": "authorization,content-type,idempotency-key",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
};

export type Role = "admin" | "athlete";

const PERMISSIONS: Record<Role, string[]> = {
  admin: [
    "members:read",
    "members:readOwn",
    "members:write",
    "documents:read",
    "documents:readOwn",
    "documents:write",
    "teams:read",
  ],
  athlete: ["members:readOwn", "documents:readOwn", "teams:read"],
};

export interface FixtureRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

export interface FixtureResponse {
  status?: number;
  body?: unknown;
}

export type FixtureHandler = (request: FixtureRequest) => FixtureResponse | undefined;

export interface Recorded {
  /** Requests received by the fixture, e.g. "POST /members". */
  calls: string[];
  /** Bodies of the write requests, by "METHOD /path". */
  bodies: Record<string, unknown>;
}

export function problem(status: number, code: string) {
  return { type: "about:blank", title: "Error", status, code };
}

/** Logs the user in (as `role`) and answers every other /api/v1 request through `handler`. */
export async function mockBackend(page: Page, role: Role, handler: FixtureHandler): Promise<Recorded> {
  const recorded: Recorded = { calls: [], bodies: {} };
  await mockApi(page);
  await seedStoredSession(page);

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      await route.fallback();
      return;
    }
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const key = `${request.method()} ${path}`;

    let response: FixtureResponse | undefined;
    if (key === "GET /me") {
      response = {
        body: {
          user: { id: "u1", email: "presidente@aquilevolley.it", firstName: "Michele", lastName: "Rucci", phone: null },
          society: { id: "s1", name: "Aquile Volley", slug: "aquile-volley" },
          roles: [role === "admin" ? "ADMIN" : "ATLETA"],
          permissions: PERMISSIONS[role],
          societies: [],
          member: null,
          children: [],
        },
      };
    } else {
      recorded.calls.push(key);
      const raw = request.postData();
      let body: unknown = raw;
      try {
        body = raw ? (JSON.parse(raw) as unknown) : null;
      } catch {
        // Binary uploads are not JSON: keep the raw text
      }
      if (request.method() !== "GET") recorded.bodies[key] = body;
      response = handler({ method: request.method(), path, query: url.searchParams, body });
    }

    if (!response) {
      await route.fallback();
      return;
    }
    const status = response.status ?? 200;
    await route.fulfill({
      status,
      headers: { ...CORS, "content-type": status >= 400 ? "application/problem+json" : "application/json" },
      body: response.body === undefined || status === 204 ? undefined : JSON.stringify(response.body),
    });
  });

  return recorded;
}

export function pageOf<T>(data: T[], nextCursor: string | null = null) {
  return { data, page: { nextCursor, hasMore: nextCursor !== null } };
}

// ---- Demo data: Aquile Volley ----------------------------------------------------------------------------------

const NOW = "2026-09-01T08:00:00.000Z";

export const TEAMS: Team[] = ["U14", "U16", "U18", "Serie D"].map((name, index) => ({
  id: `team-${index + 1}`,
  name,
  category: name,
  sport: "VOLLEY",
  gender: "FEMALE",
  description: null,
  seasonId: null,
  membersCount: 10,
  createdAt: NOW,
  updatedAt: NOW,
}));

function teamRef(name: string) {
  const team = TEAMS.find((candidate) => candidate.name === name);
  if (!team) throw new Error(`Unknown demo team ${name}`);
  return { id: team.id, name: team.name, category: team.category, position: null, jerseyNumber: null };
}

const CERTIFICATE_TYPE_ID = "type-certificate";

function indicators(certificate: DocumentIndicator["status"], expiresAt: string | null, daysRemaining: number | null) {
  const base = { documentId: "doc", expiresAt: null, daysRemaining: null };
  return [
    {
      documentTypeId: CERTIFICATE_TYPE_ID,
      key: "MEDICAL_CERTIFICATE",
      name: "Certificato medico",
      status: certificate,
      documentId: certificate === "MISSING" ? null : "doc-certificate",
      expiresAt,
      daysRemaining,
    },
    { ...base, documentTypeId: "type-form", key: "MEMBERSHIP_FORM", name: "Modulo iscrizione", status: "OK" as const },
    {
      ...base,
      documentTypeId: "type-privacy",
      key: "PRIVACY_CONSENT",
      name: "Privacy e liberatoria",
      status: "OK" as const,
    },
  ];
}

function member(
  id: string,
  firstName: string,
  lastName: string,
  team: string,
  certificate: DocumentIndicator["status"] = "OK",
) {
  const expiring = certificate === "EXPIRING";
  const documents = indicators(certificate, certificate === "MISSING" ? null : "2027-02-10", expiring ? 15 : 120);
  const overall = certificate === "OK" ? "OK" : certificate === "EXPIRING" ? "EXPIRING" : "MISSING";
  const item: MemberListItem = {
    id,
    firstName,
    lastName,
    birthDate: "2010-03-14",
    birthPlace: "Milano",
    gender: "FEMALE",
    fiscalCode: null,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.it`,
    phone: null,
    address: null,
    city: "Milano",
    postalCode: null,
    fieldRole: "Schiacciatrice",
    kitSize: "S",
    status: "ACTIVE",
    joinedAt: "2025-09-01",
    notes: null,
    teams: [teamRef(team)],
    documents,
    documentStatus: overall,
    createdAt: NOW,
    updatedAt: NOW,
  };
  return item;
}

const FILLER_NAMES = [
  ["Laura", "Villa"],
  ["Paola", "Gatti"],
  ["Francesca", "Monti"],
  ["Beatrice", "Longo"],
  ["Elisa", "Colombo"],
  ["Valentina", "Greco"],
  ["Martina", "Bruno"],
  ["Alessia", "Fontana"],
  ["Federica", "Serra"],
  ["Silvia", "Moretti"],
  ["Irene", "Barbieri"],
  ["Noemi", "Lombardi"],
  ["Giorgia", "Marini"],
  ["Camilla", "Rinaldi"],
  ["Ilaria", "Caruso"],
  ["Sofia", "Ferrara"],
  ["Greta", "Galli"],
  ["Aurora", "Costa"],
  ["Ludovica", "Mariani"],
  ["Rebecca", "Santoro"],
  ["Viola", "Parisi"],
] as const;

export const SARA_CONTI = member("m-sara", "Sara", "Conti", "U16", "EXPIRING");

export function demoMembers(): MemberListItem[] {
  const teamNames = TEAMS.map((team) => team.name);
  const fillers = FILLER_NAMES.map(([first, last], index) =>
    member(`m-${index + 10}`, first, last, teamNames[index % 4] ?? "U14"),
  );
  return [
    SARA_CONTI,
    member("m-giulia", "Giulia", "Rossi", "Serie D"),
    member("m-anna", "Anna", "Ferri", "U18", "MISSING"),
    member("m-chiara", "Chiara", "Neri", "U16"),
    member("m-elena", "Elena", "Russo", "Serie D"),
    member("m-marta", "Marta", "Bianchi", "U18"),
    ...fillers,
  ].sort((a, b) => a.lastName.localeCompare(b.lastName, "it") || a.firstName.localeCompare(b.firstName, "it"));
}

export function detailOf(item: MemberListItem): MemberDetail {
  return {
    ...item,
    guardians: [{ linkId: "g1", userId: "u9", firstName: "Paola", lastName: item.lastName, relation: "MADRE" }],
  };
}

export const CERTIFICATE_TYPE = {
  id: CERTIFICATE_TYPE_ID,
  key: "MEDICAL_CERTIFICATE",
  name: "Certificato medico",
  requiresExpiry: true,
  isRequired: true,
  validityDays: 365,
  createdAt: NOW,
  updatedAt: NOW,
};

export const FORM_TYPE = {
  ...CERTIFICATE_TYPE,
  id: "type-form",
  key: "MEMBERSHIP_FORM",
  name: "Modulo iscrizione",
  requiresExpiry: false,
  validityDays: null,
};

export function certificateOf(memberId: string) {
  return {
    id: "doc-certificate",
    memberId,
    documentType: {
      id: CERTIFICATE_TYPE_ID,
      key: "MEDICAL_CERTIFICATE",
      name: "Certificato medico",
      requiresExpiry: true,
    },
    title: null,
    issuedAt: "2026-02-10",
    expiresAt: "2027-02-10",
    status: "OK",
    daysRemaining: 120,
    hasFile: true,
    fileName: "certificato.pdf",
    mimeType: "application/pdf",
    sizeBytes: 245_760,
    downloadUrl: "/api/v1/documents/doc-certificate/file",
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}
