import type { TenantRequestContext } from '../../plugins/auth.js';
import type { DocumentIndicator } from './schema.js';
import {
  daysUntil,
  formatDateOnly,
  overallStatus,
  pickCurrentDocument,
  statusOfDocument,
  type OverallDocumentStatus,
} from './status.js';

export interface MemberDocumentState {
  indicators: DocumentIndicator[];
  overall: OverallDocumentStatus;
}

// The status indicators of SPEC 01: one per REQUIRED document type, for each of the given members.
// Two queries whatever the number of members; members with no document at all get MISSING indicators.
export async function loadDocumentStates(
  { db }: Pick<TenantRequestContext, 'db'>,
  memberIds: readonly string[],
  now: Date,
): Promise<Map<string, MemberDocumentState>> {
  const types = await db.documentType.findMany({
    where: { isRequired: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const documents =
    memberIds.length === 0 || types.length === 0
      ? []
      : await db.document.findMany({
          where: { memberId: { in: [...memberIds] }, documentTypeId: { in: types.map((type) => type.id) } },
          select: { id: true, memberId: true, documentTypeId: true, expiresAt: true },
        });

  const byKey = new Map<string, typeof documents>();
  for (const document of documents) {
    const key = `${document.memberId}:${document.documentTypeId}`;
    byKey.set(key, [...(byKey.get(key) ?? []), document]);
  }

  const states = new Map<string, MemberDocumentState>();
  for (const memberId of memberIds) {
    const indicators = types.map((type): DocumentIndicator => {
      const current = pickCurrentDocument(byKey.get(`${memberId}:${type.id}`) ?? [], type.requiresExpiry);
      const status = statusOfDocument(current, type.requiresExpiry, now);
      const expiresAt = type.requiresExpiry ? (current?.expiresAt ?? null) : null;
      return {
        documentTypeId: type.id,
        key: type.key,
        name: type.name,
        status,
        documentId: current?.id ?? null,
        expiresAt: expiresAt ? formatDateOnly(expiresAt) : null,
        daysRemaining: expiresAt ? daysUntil(expiresAt, now) : null,
      };
    });
    states.set(memberId, { indicators, overall: overallStatus(indicators.map((indicator) => indicator.status)) });
  }
  return states;
}
