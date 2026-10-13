import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import type { MeResponse } from "@/lib/api";
import type { DocumentIndicator, DocumentType, MemberDetail, MemberDocument, MemberListItem, Team } from "./types";

/** Helpers shared by the Vitest suites of the members and expirations modules (never imported by product code). */

export interface MockRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: unknown;
}

export interface MockResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export type MockHandler = (request: MockRequest) => MockResponse | Promise<MockResponse>;

/** Replaces `fetch`: handlers are keyed "METHOD /path" (path without the /api/v1 prefix). Unknown routes answer 404. */
export function mockApi(handlers: Record<string, MockHandler>): { calls: MockRequest[] } {
  const calls: MockRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const raw = init?.body;
      const request: MockRequest = {
        method: init?.method ?? "GET",
        path: url.pathname.replace(/^\/api\/v1/, ""),
        query: url.searchParams,
        headers: (init?.headers ?? {}) as Record<string, string>,
        body: typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw,
      };
      calls.push(request);
      const handler = handlers[`${request.method} ${request.path}`];
      if (!handler) {
        return new Response(JSON.stringify({ title: "Not Found", status: 404, code: "not_found" }), {
          status: 404,
          headers: { "content-type": "application/problem+json" },
        });
      }
      const { status = 200, body, headers } = await handler(request);
      const isError = status >= 400;
      return new Response(body === undefined || status === 204 ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": isError ? "application/problem+json" : "application/json", ...headers },
      });
    }),
  );
  return { calls };
}

export function problem(status: number, code: string, errors?: Array<{ path: string; message: string }>): MockResponse {
  return { status, body: { type: "about:blank", title: "Error", status, code, errors } };
}

export function page<T>(data: T[], nextCursor: string | null = null): MockResponse {
  return { body: { data, page: { nextCursor, hasMore: nextCursor !== null } } };
}

export const ADMIN_PERMISSIONS = [
  "members:read",
  "members:readOwn",
  "members:write",
  "documents:read",
  "documents:readOwn",
  "documents:write",
  "teams:read",
];

export const ATHLETE_PERMISSIONS = ["members:readOwn", "documents:readOwn", "teams:read"];

export function meWith(permissions: string[]): MeResponse {
  return {
    user: { id: "u1", email: "presidente@aquilevolley.it", firstName: "Michele", lastName: "Rucci", phone: null },
    society: { id: "s1", name: "Aquile Volley", slug: "aquile-volley" },
    roles: ["ADMIN"],
    permissions,
    societies: [],
    member: null,
    children: [],
  };
}

/** Renders inside the providers a screen needs: query cache without retries, toasts. */
export function renderScreen(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>,
  );
}

// ---- Demo data (Aquile Volley) ----------------------------------------------------------------------------------

export function indicator(
  overrides: Partial<DocumentIndicator> & Pick<DocumentIndicator, "key" | "name">,
): DocumentIndicator {
  return {
    documentTypeId: `type-${overrides.key}`,
    status: "OK",
    documentId: `doc-${overrides.key}`,
    expiresAt: null,
    daysRemaining: null,
    ...overrides,
  };
}

export const CERTIFICATE_INDICATOR = indicator({ key: "MEDICAL_CERTIFICATE", name: "Certificato medico" });
export const FORM_INDICATOR = indicator({ key: "MEMBERSHIP_FORM", name: "Modulo iscrizione" });
export const PRIVACY_INDICATOR = indicator({ key: "PRIVACY_CONSENT", name: "Privacy e liberatoria" });

export function member(
  overrides: Partial<MemberListItem> & Pick<MemberListItem, "id" | "firstName" | "lastName">,
): MemberListItem {
  return {
    birthDate: null,
    birthPlace: null,
    gender: null,
    fiscalCode: null,
    email: null,
    phone: null,
    address: null,
    city: null,
    postalCode: null,
    fieldRole: null,
    kitSize: null,
    status: "ACTIVE",
    joinedAt: null,
    notes: null,
    teams: [],
    documents: [CERTIFICATE_INDICATOR, FORM_INDICATOR, PRIVACY_INDICATOR],
    documentStatus: "OK",
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}

export const TEAM_U16 = { id: "t16", name: "U16", category: "U16", position: null, jerseyNumber: null };
export const TEAM_SERIE_D = { id: "td", name: "Serie D", category: "Serie D", position: "Libero", jerseyNumber: 7 };

export const SARA_CONTI = member({
  id: "m-sara",
  firstName: "Sara",
  lastName: "Conti",
  teams: [TEAM_U16],
  fieldRole: "Libero",
  documents: [
    indicator({
      key: "MEDICAL_CERTIFICATE",
      name: "Certificato medico",
      status: "EXPIRING",
      expiresAt: "2026-11-27",
      daysRemaining: 15,
    }),
    FORM_INDICATOR,
    PRIVACY_INDICATOR,
  ],
  documentStatus: "EXPIRING",
});

export const GIULIA_ROSSI = member({ id: "m-giulia", firstName: "Giulia", lastName: "Rossi", teams: [TEAM_SERIE_D] });

export const ANNA_FERRI = member({
  id: "m-anna",
  firstName: "Anna",
  lastName: "Ferri",
  documents: [
    indicator({ key: "MEDICAL_CERTIFICATE", name: "Certificato medico", status: "MISSING", documentId: null }),
    FORM_INDICATOR,
    PRIVACY_INDICATOR,
  ],
  documentStatus: "MISSING",
});

export function detailOf(base: MemberListItem, overrides: Partial<MemberDetail> = {}): MemberDetail {
  return { ...base, guardians: [], ...overrides };
}

export function team(id: string, name: string, category: string | null = name): Team {
  return {
    id,
    name,
    category,
    sport: "VOLLEY",
    gender: "FEMALE",
    description: null,
    seasonId: null,
    membersCount: 10,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
  };
}

export const TEAMS: Team[] = [team("t16", "U16"), team("td", "Serie D")];

export const CERTIFICATE_TYPE: DocumentType = {
  id: "type-MEDICAL_CERTIFICATE",
  key: "MEDICAL_CERTIFICATE",
  name: "Certificato medico",
  requiresExpiry: true,
  isRequired: true,
  validityDays: 365,
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
};

export const FORM_TYPE: DocumentType = {
  ...CERTIFICATE_TYPE,
  id: "type-MEMBERSHIP_FORM",
  key: "MEMBERSHIP_FORM",
  name: "Modulo iscrizione",
  requiresExpiry: false,
  validityDays: null,
};

export function documentOf(overrides: Partial<MemberDocument> = {}): MemberDocument {
  return {
    id: "doc-1",
    memberId: "m-sara",
    documentType: {
      id: "type-MEDICAL_CERTIFICATE",
      key: "MEDICAL_CERTIFICATE",
      name: "Certificato medico",
      requiresExpiry: true,
    },
    title: null,
    issuedAt: "2025-11-27",
    expiresAt: "2026-11-27",
    status: "EXPIRING",
    daysRemaining: 15,
    hasFile: true,
    fileName: "certificato-conti.pdf",
    mimeType: "application/pdf",
    sizeBytes: 245_760,
    downloadUrl: "/api/v1/documents/doc-1/file",
    notes: null,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}
