import type { EmailTransport } from '../../lib/email.js';
import type { TenantDb } from '../../lib/tenant.js';

// Queue processing for the EMAIL channel (SPEC 07: queues, retry, delivery log).
// A queued email is a Notification row with channel EMAIL and status PENDING. Every attempt writes a
// NotificationLog row. Outcomes: SENT; SKIPPED (nothing to send with: no provider, disabled account); FAILED after
// `maxAttempts` or when the provider rejects the message for good; otherwise it stays PENDING with a back-off.

export interface DispatchOptions {
  transport: EmailTransport | null;
  maxAttempts: number;
  batchSize: number;
  now: Date;
}

export interface DispatchSummary {
  sent: number;
  skipped: number;
  failed: number;
  retryLater: number;
}

const RETRY_BASE_MS = 5 * 60 * 1000;

// 5, 10, 20... minutes after the 1st, 2nd, 3rd... failed attempt.
export function retryDelayMs(attempt: number): number {
  return RETRY_BASE_MS * 2 ** (attempt - 1);
}

export async function dispatchQueuedEmails(
  db: TenantDb,
  societyId: string,
  options: DispatchOptions,
): Promise<DispatchSummary> {
  const { transport, maxAttempts, batchSize, now } = options;
  const queued = await db.notification.findMany({
    where: { channel: 'EMAIL', status: 'PENDING', OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }] },
    include: { user: { select: { email: true, isActive: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: batchSize,
  });

  const summary: DispatchSummary = { sent: 0, skipped: 0, failed: 0, retryLater: 0 };
  for (const notification of queued) {
    // Optimistic claim: only one worker bumps `attempts` from the value it read, so a message is never sent twice
    // by two overlapping runs (scheduled + manual).
    const claim = await db.notification.updateMany({
      where: { id: notification.id, status: 'PENDING', attempts: notification.attempts },
      data: { attempts: { increment: 1 } },
    });
    if (claim.count === 0) continue;
    const attempt = notification.attempts + 1;
    const record = (status: 'SENT' | 'FAILED' | 'SKIPPED', provider: string | null, error: string | null) =>
      db.notificationLog.create({
        data: { societyId, notificationId: notification.id, attempt, status, provider, error },
      });

    if (!notification.user.isActive || transport === null) {
      const reason = transport === null ? 'Email provider not configured' : 'The account is disabled';
      await record('SKIPPED', transport?.provider ?? null, reason);
      await db.notification.update({ where: { id: notification.id }, data: { status: 'SKIPPED' } });
      summary.skipped += 1;
      continue;
    }

    const result = await transport.send({
      to: notification.user.email,
      subject: notification.title,
      text: notification.body,
      idempotencyKey: notification.id,
    });
    if (result.ok) {
      await record('SENT', transport.provider, null);
      await db.notification.update({ where: { id: notification.id }, data: { status: 'SENT', sentAt: now } });
      summary.sent += 1;
      continue;
    }

    await record('FAILED', transport.provider, result.error);
    if (!result.retryable || attempt >= maxAttempts) {
      await db.notification.update({ where: { id: notification.id }, data: { status: 'FAILED' } });
      summary.failed += 1;
    } else {
      await db.notification.update({
        where: { id: notification.id },
        data: { scheduledAt: new Date(now.getTime() + retryDelayMs(attempt)) },
      });
      summary.retryLater += 1;
    }
  }
  return summary;
}
