import { z } from 'zod';
import type { AppConfig } from '../config/env.js';

// Email channel (SPEC 07). `EmailTransport` is the seam between the notification queue and a provider;
// Resend is the only implementation and it exists only when RESEND_API_KEY is configured.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  // Stable per notification: the provider drops a retry of a message it already accepted.
  idempotencyKey: string;
}

export type EmailResult = { ok: true; providerId: string | null } | { ok: false; error: string; retryable: boolean };

export interface EmailTransport {
  readonly provider: string;
  send(message: EmailMessage): Promise<EmailResult>;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const RESEND_URL = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 10_000;
const resendSuccessSchema = z.object({ id: z.string().optional() });
const resendErrorSchema = z.object({ message: z.string().optional() });

export function createResendTransport(
  options: { apiKey: string; from: string },
  fetchImpl: FetchLike = fetch,
): EmailTransport {
  return {
    provider: 'resend',
    async send(message) {
      let response: Response;
      try {
        response = await fetchImpl(RESEND_URL, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json',
            'idempotency-key': message.idempotencyKey,
          },
          body: JSON.stringify({ from: options.from, to: [message.to], subject: message.subject, text: message.text }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : 'Network error', retryable: true };
      }

      // The provider response is external data: parse it, never trust its shape.
      const payload: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const parsed = resendSuccessSchema.safeParse(payload);
        return { ok: true, providerId: parsed.success ? (parsed.data.id ?? null) : null };
      }
      const detail = resendErrorSchema.safeParse(payload);
      const reason = detail.success && detail.data.message ? detail.data.message : 'no detail';
      // 4xx (except 429) means the message itself is rejected: retrying cannot help.
      const retryable = response.status >= 500 || response.status === 429;
      return { ok: false, error: `Resend answered ${response.status}: ${reason}`.slice(0, 500), retryable };
    },
  };
}

// null when no provider is configured: the queue then records the email as SKIPPED instead of pretending to send it.
export function createEmailTransport(config: Pick<AppConfig, 'RESEND_API_KEY' | 'EMAIL_FROM'>): EmailTransport | null {
  if (!config.RESEND_API_KEY || !config.EMAIL_FROM) return null;
  return createResendTransport({ apiKey: config.RESEND_API_KEY, from: config.EMAIL_FROM });
}
