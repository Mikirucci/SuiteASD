import type { SeedStep } from './context.js';

// SPEC 03 and 6: "Quota novembre" of 60 EUR for every active member. Four members have already paid (240 EUR in
// total: the "Incassato 240" header) and got a numbered receipt; "Promemoria inviati 4" is the sum of the reminders
// already sent. Marta Bianchi still owes October (overdue) and Sara Conti has not paid November yet.

const FEE_CENTS = 6000;
const NOVEMBER_DUE = new Date(Date.UTC(2026, 10, 10));
const OCTOBER_DUE = new Date(Date.UTC(2026, 9, 10));
// The society had issued 143 receipts before the demo data: the next ones are n. 0144 to n. 0147.
const RECEIPTS_ALREADY_ISSUED = 143;

const PAID = [
  { name: 'Anna Ferri', method: 'BANK_TRANSFER', paidAt: new Date(Date.UTC(2026, 9, 6, 9, 30)), reference: 'CRO 2026100600412' },
  { name: 'Chiara Neri', method: 'CASH', paidAt: new Date(Date.UTC(2026, 9, 7, 17, 10)), reference: null },
  { name: 'Elena Russo', method: 'CARD', paidAt: new Date(Date.UTC(2026, 9, 8, 18, 45)), reference: null },
  { name: 'Giulia Rossi', method: 'CASH', paidAt: new Date(Date.UTC(2026, 9, 9, 18, 0)), reference: null },
] as const;

export const seedFees: SeedStep = async (context) => {
  const { prisma, societyId } = context;
  const november = await prisma.feePlan.create({
    data: { societyId, name: 'Quota novembre', kind: 'MONTHLY', amountCents: FEE_CENTS, dueDay: 10, installments: 1 },
  });

  const members = await prisma.member.findMany({ where: { societyId, status: 'ACTIVE' }, orderBy: { id: 'asc' } });
  const reminders = new Map([['Sara Conti', 1]]);
  await prisma.payment.createMany({
    data: members.map((member) => ({
      societyId,
      memberId: member.id,
      feePlanId: november.id,
      description: november.name,
      amountCents: FEE_CENTS,
      dueDate: NOVEMBER_DUE,
      reminderCount: reminders.get(`${member.firstName} ${member.lastName}`) ?? 0,
    })),
  });

  // Marta Bianchi's October fee: an extra fee outside the plan, overdue, reminded three times.
  const marta = context.memberIds['Marta Bianchi'];
  if (!marta) throw new Error('Demo member Marta Bianchi is missing');
  await prisma.payment.create({
    data: {
      societyId,
      memberId: marta,
      description: 'Quota ottobre',
      amountCents: FEE_CENTS,
      dueDate: OCTOBER_DUE,
      reminderCount: 3,
      lastReminderAt: new Date(Date.UTC(2026, 9, 12, 7, 0)),
    },
  });

  let number = RECEIPTS_ALREADY_ISSUED;
  for (const entry of PAID) {
    const memberId = context.memberIds[entry.name];
    if (!memberId) throw new Error(`Demo member ${entry.name} is missing`);
    const payment = await prisma.payment.findFirstOrThrow({ where: { societyId, memberId, feePlanId: november.id } });
    number += 1;
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'PAID',
        paidAt: entry.paidAt,
        method: entry.method,
        reference: entry.reference,
        recordedById: context.users.segreteria.id,
      },
    });
    await prisma.receipt.create({
      data: { societyId, paymentId: payment.id, number, issuedAt: entry.paidAt, sentAt: entry.paidAt },
    });
  }
  await prisma.receiptSequence.create({ data: { societyId, lastNumber: number } });
};
