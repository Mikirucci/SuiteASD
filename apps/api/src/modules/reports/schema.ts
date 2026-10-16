import { z } from 'zod';
import { dateOnlySchema, fromDateOnly } from '../../lib/date-only.js';

// The money sections of the report for the accountant (docs/DECISIONS.md D-24). Every one can be exported alone;
// with none given the report contains all of them.
export const REPORT_SECTIONS = ['LEDGER', 'FEES', 'SPONSORS', 'TRIPS', 'REFEREES'] as const;
export const reportSectionSchema = z.enum(REPORT_SECTIONS);
export type ReportSection = z.infer<typeof reportSectionSchema>;

const MAX_RANGE_DAYS = 366 * 5;
const DAY_MS = 86_400_000;

function startOfYear(now: Date): string {
  return `${now.getUTCFullYear()}-01-01`;
}

// `from` and `to` are calendar days, both included. Default: the current year until today (UTC).
export const accountingReportQuerySchema = z
  .object({
    from: dateOnlySchema.optional().describe('First day, included. Default: 1 January of the current year'),
    to: dateOnlySchema.optional().describe('Last day, included. Default: today'),
    sections: z
      .string()
      .optional()
      .transform((value) => (value ? value.split(',').map((part) => part.trim()).filter((part) => part !== '') : []))
      .pipe(z.array(reportSectionSchema).max(REPORT_SECTIONS.length))
      .describe(`Comma separated, among ${REPORT_SECTIONS.join(', ')}. Default: all of them`),
  })
  .transform((query) => {
    const now = new Date();
    return {
      from: query.from ?? startOfYear(now),
      to: query.to ?? now.toISOString().slice(0, 10),
      sections: query.sections.length === 0 ? [...REPORT_SECTIONS] : [...new Set(query.sections)],
    };
  })
  .refine((query) => query.from <= query.to, { message: '"from" cannot be after "to"', path: ['from'] })
  .refine((query) => (fromDateOnly(query.to).getTime() - fromDateOnly(query.from).getTime()) / DAY_MS <= MAX_RANGE_DAYS, {
    message: 'The period cannot be longer than five years',
    path: ['to'],
  });

export const reportSummarySchema = z.object({
  period: z.object({ from: dateOnlySchema, to: dateOnlySchema }),
  sections: z.array(
    z.object({
      section: reportSectionSchema,
      records: z.number().int().describe('Rows the section would list'),
      amountCents: z.number().int().describe('Main total of the section (see the PDF for the detail)'),
    }),
  ),
});

export type AccountingReportQuery = z.output<typeof accountingReportQuerySchema>;
export type ReportSummaryDto = z.infer<typeof reportSummarySchema>;
