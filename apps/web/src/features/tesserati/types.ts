/** Wire types of the members, teams and documents endpoints. Source of truth: apps/api/src/modules/{members,documents,teams}/schema.ts. */

import type { GuardianRelation } from "@/lib/api";

export interface CursorPage<T> {
  data: T[];
  page: { nextCursor: string | null; hasMore: boolean };
}

export type MemberGender = "FEMALE" | "MALE";
export type MemberStatus = "ACTIVE" | "INACTIVE";
/** Worst indicator of a member: MISSING also covers expired documents. */
export type OverallDocumentStatus = "OK" | "EXPIRING" | "MISSING";
export type DocumentStatus = "OK" | "EXPIRING" | "EXPIRED" | "MISSING";

export interface DocumentIndicator {
  documentTypeId: string;
  key: string;
  name: string;
  status: DocumentStatus;
  documentId: string | null;
  /** Date only, "YYYY-MM-DD". */
  expiresAt: string | null;
  daysRemaining: number | null;
}

export interface MemberTeamRef {
  id: string;
  name: string;
  category: string | null;
  position: string | null;
  jerseyNumber: number | null;
}

export interface MemberListItem {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  birthPlace: string | null;
  gender: MemberGender | null;
  fiscalCode: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  fieldRole: string | null;
  kitSize: string | null;
  status: MemberStatus;
  joinedAt: string | null;
  notes: string | null;
  teams: MemberTeamRef[];
  documents: DocumentIndicator[];
  documentStatus: OverallDocumentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MemberGuardian {
  linkId: string;
  userId: string;
  firstName: string;
  lastName: string;
  relation: GuardianRelation;
}

export interface MemberDetail extends MemberListItem {
  guardians: MemberGuardian[];
}

export interface MemberSummary {
  tesserati: number;
  squadre: number;
  documentiMancanti: number;
}

export interface MembersFilters {
  q: string;
  teamId: string;
  /** Only members who belong to no team yet (ignored when a team is chosen). */
  noTeam: boolean;
  documentStatus: OverallDocumentStatus | "";
  gender: MemberGender | "";
  fieldRole: string;
  /** Four digits, or empty. */
  birthYear: string;
}

export const EMPTY_MEMBERS_FILTERS: MembersFilters = {
  q: "",
  teamId: "",
  noTeam: false,
  documentStatus: "",
  gender: "",
  fieldRole: "",
  birthYear: "",
};

/** Body of POST /members. Optional fields are left out when empty. */
export interface CreateMemberBody {
  firstName: string;
  lastName: string;
  birthDate?: string;
  birthPlace?: string;
  gender?: MemberGender;
  fiscalCode?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  fieldRole?: string;
  kitSize?: string;
  status: MemberStatus;
  joinedAt?: string;
  notes?: string;
  teamIds: string[];
}

/** Body of PATCH /members/:id: `null` clears an optional field. */
export interface UpdateMemberBody {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  birthPlace: string | null;
  gender: MemberGender | null;
  fiscalCode: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  fieldRole: string | null;
  kitSize: string | null;
  status: MemberStatus;
  joinedAt: string | null;
  notes: string | null;
  teamIds: string[];
}

export interface ImportMembersResult {
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  created: number;
  ignoredColumns: string[];
  errors: Array<{ row: number; field: string | null; message: string }>;
}

export interface Team {
  id: string;
  name: string;
  category: string | null;
  sport: string;
  gender: string | null;
  description: string | null;
  seasonId: string | null;
  membersCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentType {
  id: string;
  key: string;
  name: string;
  requiresExpiry: boolean;
  isRequired: boolean;
  validityDays: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MemberDocument {
  id: string;
  memberId: string;
  documentType: { id: string; key: string; name: string; requiresExpiry: boolean };
  title: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  status: DocumentStatus;
  daysRemaining: number | null;
  hasFile: boolean;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  /** Path of the authorized download endpoint, prefixed with /api/v1; null when absent or not allowed. */
  downloadUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentBody {
  documentTypeId: string;
  title?: string;
  issuedAt?: string;
  expiresAt?: string;
  notes?: string;
}

/** Body of PATCH /documents/:id: only the fields sent change, `null` clears one. */
export interface UpdateDocumentBody {
  title?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  notes?: string | null;
}
