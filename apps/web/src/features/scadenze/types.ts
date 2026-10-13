/** Wire types of GET /documents/expirations. Source of truth: apps/api/src/modules/documents/schema.ts. */

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
