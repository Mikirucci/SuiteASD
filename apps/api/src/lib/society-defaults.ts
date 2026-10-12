import type { Prisma } from '@prisma/client';

// Document types every new society starts with (SPEC 01/02): three status indicators on the member list.
const DEFAULT_DOCUMENT_TYPES = [
  { key: 'MEDICAL_CERTIFICATE', name: 'Certificato medico', requiresExpiry: true, isRequired: true, validityDays: 365 },
  { key: 'MEMBERSHIP_FORM', name: 'Modulo iscrizione', requiresExpiry: false, isRequired: true, validityDays: null },
  { key: 'PRIVACY_CONSENT', name: 'Privacy e liberatoria', requiresExpiry: false, isRequired: true, validityDays: null },
] as const;

export async function createDefaultDocumentTypes(
  tx: Pick<Prisma.TransactionClient, 'documentType'>,
  societyId: string,
): Promise<void> {
  await tx.documentType.createMany({
    data: DEFAULT_DOCUMENT_TYPES.map((type) => ({ ...type, societyId })),
  });
}
