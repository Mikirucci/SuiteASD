import type { SeedStep } from './context.js';

// What the administration finds when it opens the app for the first time: the notifications an administrator is
// meant to receive (docs/DECISIONS.md D-21) and one enrolment link ready to share.

export const DEMO_JOIN_CODE = 'iscrizione-demo-u16';

const HOUR_MS = 3_600_000;

const ADMIN_NOTIFICATIONS = [
  {
    type: 'ADMIN_DOCUMENT_ALERT',
    title: 'Documenti da sistemare',
    body: '2 tesserati con 3 documenti mancanti o scaduti · 1 documento in scadenza',
    hoursAgo: 3,
    read: false,
  },
  {
    type: 'ADMIN_PAYMENT_RECEIVED',
    title: 'Pagamento ricevuto',
    body: 'Sara Conti · Quota novembre · € 60',
    hoursAgo: 26,
    read: false,
  },
  {
    type: 'ADMIN_FEE_OVERDUE',
    title: 'Quote scadute da incassare',
    body: '1 quota scaduta per € 60 complessivi',
    hoursAgo: 50,
    read: true,
  },
] as const;

export const seedAdministration: SeedStep = async ({ prisma, societyId, users, teamIds }) => {
  const now = Date.now();
  // Written directly (in-app only): seeding must not queue demo emails for the dispatch job.
  for (const user of [users.admin, users.segreteria]) {
    for (const notification of ADMIN_NOTIFICATIONS) {
      const createdAt = new Date(now - notification.hoursAgo * HOUR_MS);
      await prisma.notification.create({
        data: {
          societyId,
          userId: user.id,
          type: notification.type,
          channel: 'IN_APP',
          title: notification.title,
          body: notification.body,
          status: 'SENT',
          sentAt: createdAt,
          createdAt,
          readAt: notification.read ? createdAt : null,
        },
      });
    }
  }

  await prisma.joinLink.create({
    data: {
      societyId,
      teamId: teamIds.U16 ?? null,
      code: DEMO_JOIN_CODE,
      label: 'Open day U16',
      createdById: users.admin.id,
    },
  });
};
