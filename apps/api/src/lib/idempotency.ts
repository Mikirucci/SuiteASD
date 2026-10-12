import { createHash } from 'node:crypto';
import { z } from 'zod';
import { conflict, unprocessable } from './errors.js';
import { isUniqueViolation } from './prisma-errors.js';
import type { TenantRequestContext } from '../plugins/auth.js';
import type { TenantDb } from './tenant.js';

// Idempotency-Key support for sensitive writes (SPEC 5-bis): the same key replays the stored response, so a
// client retry after a timeout can never apply the effect twice.
//
// The key is claimed by inserting a row under the unique (societyId, key) constraint INSIDE the same transaction as
// the effect: both commit together or neither does, and of two concurrent requests with one key exactly one wins
// the insert. The loser fails on the constraint and replays the winner's committed response.
// A failed request rolls the claim back, so the client can retry it with the same key.

export type TenantTx = Parameters<Parameters<TenantDb['$transaction']>[0]>[0];

// Documented on every route that requires the header (OpenAPI). A missing header is a 422 validation error.
export const idempotencyKeyHeaderSchema = z.object({
  'idempotency-key': z
    .string()
    .trim()
    .min(8)
    .max(128)
    .regex(/^[\w.:-]+$/, 'Only letters, digits and . _ : - are allowed')
    .describe('Client-generated unique key (e.g. a UUID), reused when retrying the same request'),
});

export interface IdempotentResult<T> {
  status: number;
  body: T;
}

export interface IdempotentOutcome<T> extends IdempotentResult<T> {
  replayed: boolean;
}

// `fingerprint` must identify the request intent (route + target + body); the same key with another fingerprint is rejected.
export async function withIdempotency<T>(
  ctx: TenantRequestContext,
  key: string,
  fingerprint: unknown,
  execute: (tx: TenantTx) => Promise<IdempotentResult<T>>,
): Promise<IdempotentOutcome<T>> {
  const requestHash = createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex');
  try {
    const result = await ctx.db.$transaction(async (tx) => {
      const claim = await tx.idempotencyKey.create({
        data: { societyId: ctx.auth.societyId, key, requestHash, responseStatus: 0, responseBody: 'null' },
      });
      const outcome = await execute(tx);
      await tx.idempotencyKey.update({
        where: { id: claim.id },
        data: { responseStatus: outcome.status, responseBody: JSON.stringify(outcome.body) },
      });
      return outcome;
    });
    return { ...result, replayed: false };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const stored = await ctx.db.idempotencyKey.findFirst({ where: { key } });
    if (!stored) throw conflict('idempotency_in_progress', 'A request with this Idempotency-Key is being processed');
    if (stored.requestHash !== requestHash) {
      throw unprocessable('idempotency_key_reused', 'This Idempotency-Key was already used with a different request');
    }
    // Written by this function from the JSON-serialised DTO of the first response.
    return { status: stored.responseStatus, body: JSON.parse(stored.responseBody) as T, replayed: true };
  }
}
