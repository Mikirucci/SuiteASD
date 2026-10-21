/** Wire types of GET /documents/expirations. Source of truth: apps/api/src/modules/documents/schema.ts. */

import type { DocumentStatus } from "@/features/tesserati/types";

export type ExpirationStatus = "OK" | "EXPIRING" | "EXPIRED";

export interface ExpirationItem {
  documentId: string;
  memberId: string;
  firstName: string;
  lastName: string;
  /** Names of the member's current teams. */
  teams: string[];
  documentType: { id: string; key: string; name: string };
  /** Date only, "YYYY-MM-DD". */
  expiresAt: string;
  /** Negative once expired. */
  daysRemaining: number;
  status: ExpirationStatus;
}

export interface Expirations {
  /** First day of the window, "YYYY-MM-DD". */
  from: string;
  /** Last day of the window, "YYYY-MM-DD". */
  to: string;
  months: Array<{ month: string; items: ExpirationItem[] }>;
  /** Current documents already expired before the window. */
  overdue: ExpirationItem[];
}

export interface ExpirationFilters {
  teamId: string;
  documentTypeId: string;
}

/** Wire types of GET /document-types/report and GET /document-types/:id/people. */

export interface TypeStats {
  /** People whose current document is valid. */
  validPeople: number;
  /** People whose current document expires within 30 days. */
  expiringPeople: number;
  expiredPeople: number;
  /** People with no document, or one whose file has not arrived. */
  missingPeople: number;
}

export interface TypeReportEntry extends TypeStats {
  documentTypeId: string;
}

export interface TypeReport {
  data: TypeReportEntry[];
}

export interface TypePerson {
  memberId: string;
  memberName: string;
  teams: Array<{ id: string; name: string }>;
  status: DocumentStatus;
  documentId: string | null;
  /** Date only, "YYYY-MM-DD". */
  expiresAt: string | null;
  daysRemaining: number | null;
  hasFile: boolean;
}

/** The stats describe the whole type whatever the filters; the people are filtered and ordered by name. */
export interface TypePeople {
  stats: TypeStats;
  people: TypePerson[];
}

export interface TypePeopleFilters {
  q: string;
  teamId: string;
  status: DocumentStatus | "";
}
