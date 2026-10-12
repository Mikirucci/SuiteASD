import { z } from 'zod';
import type { TenantRequestContext } from '../../plugins/auth.js';

// Volleyball squad size (SPEC 04: "5/12 confermate"); an event can override it with `maxConvocations`.
export const DEFAULT_MAX_CONVOCATIONS = 12;

export const convocationSummarySchema = z.object({
  confirmed: z.number().int(),
  declined: z.number().int(),
  pending: z.number().int(),
  total: z.number().int().describe('Convocated athletes'),
  capacity: z.number().int().describe('Convocation slots for this event ("5/12 confermate")'),
});

export type ConvocationSummary = z.infer<typeof convocationSummarySchema>;

export function maxConvocationsOf(event: { maxConvocations: number | null }): number {
  return event.maxConvocations ?? DEFAULT_MAX_CONVOCATIONS;
}

// One grouped query for any number of events.
export async function loadConvocationSummaries(
  { db }: Pick<TenantRequestContext, 'db'>,
  events: readonly { id: string; maxConvocations: number | null }[],
): Promise<Map<string, ConvocationSummary>> {
  const groups =
    events.length === 0
      ? []
      : await db.convocation.groupBy({
          by: ['eventId', 'status'],
          where: { eventId: { in: events.map((event) => event.id) } },
          _count: { _all: true },
          orderBy: { eventId: 'asc' },
        });
  const summaries = new Map<string, ConvocationSummary>();
  for (const event of events) {
    summaries.set(event.id, { confirmed: 0, declined: 0, pending: 0, total: 0, capacity: maxConvocationsOf(event) });
  }
  for (const group of groups) {
    const summary = summaries.get(group.eventId);
    if (!summary) continue;
    const count = group._count._all;
    summary.total += count;
    if (group.status === 'CONFIRMED') summary.confirmed += count;
    else if (group.status === 'DECLINED') summary.declined += count;
    else summary.pending += count;
  }
  return summaries;
}
