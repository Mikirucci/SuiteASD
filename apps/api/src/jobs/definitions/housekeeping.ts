import type { AutomationDefinition } from '../registry.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const INVITATION_RETENTION_DAYS = 30;

// Example automation (and a real maintenance task): purges expired refresh tokens and long-expired invitations.
// Revoked-but-not-yet-expired refresh tokens are kept: they are what detects token reuse.
export const housekeeping: AutomationDefinition = {
  key: 'housekeeping',
  name: 'Pulizia sessioni e inviti',
  description: 'Rimuove i token di sessione scaduti e gli inviti scaduti da oltre 30 giorni.',
  schedule: '30 3 * * *',
  enabledByDefault: true,
  async run({ db, now }) {
    const tokens = await db.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } });
    const invitations = await db.invitation.deleteMany({
      where: { expiresAt: { lt: new Date(now.getTime() - INVITATION_RETENTION_DAYS * DAY_MS) } },
    });
    return { refreshTokensDeleted: tokens.count, invitationsDeleted: invitations.count };
  },
};
