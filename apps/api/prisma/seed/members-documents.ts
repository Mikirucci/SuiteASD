import type { SeedStep } from './context.js';

// Documents for every demo member (SPEC section 6): nobody is missing a document, so the footer reads
// "0 documenti mancanti". Sara Conti's medical certificate expires in 15 days; all the others are spread over
// the following months so the expiry timeline (OTT -> MAR) is populated.

const DAY_MS = 86_400_000;
const SARA_CONTI = 'Sara Conti';

function utcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export const seedMemberDocuments: SeedStep = async (context) => {
  const types = await context.prisma.documentType.findMany({ where: { societyId: context.societyId } });
  const byKey = new Map(types.map((type) => [type.key, type]));
  const certificate = byKey.get('MEDICAL_CERTIFICATE');
  const enrolment = byKey.get('MEMBERSHIP_FORM');
  const privacy = byKey.get('PRIVACY_CONSENT');
  if (!certificate || !enrolment || !privacy) throw new Error('Default document types are missing');

  const today = utcMidnight(new Date());
  const issuedAt = new Date(Date.UTC(2025, 8, 1));
  const documents = Object.entries(context.memberIds).flatMap(([name, memberId], index) => {
    // 45..225 days ahead: beyond the 30-day warning threshold, spread across ~7 months.
    const daysAhead = name === SARA_CONTI ? 15 : 45 + ((index * 11) % 181);
    const base = { societyId: context.societyId, memberId, issuedAt };
    return [
      {
        ...base,
        documentTypeId: certificate.id,
        title: 'Certificato medico',
        issuedAt: new Date(today.getTime() + (daysAhead - 365) * DAY_MS),
        expiresAt: new Date(today.getTime() + daysAhead * DAY_MS),
      },
      { ...base, documentTypeId: enrolment.id, title: 'Modulo iscrizione 2025/26' },
      { ...base, documentTypeId: privacy.id, title: 'Privacy e liberatoria' },
    ];
  });
  await context.prisma.document.createMany({ data: documents });
};
