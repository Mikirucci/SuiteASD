import type { Prisma } from '@prisma/client';
import { CsvParseError, parseCsv, toCsv } from '../../lib/csv.js';
import { conflict, notFound, unprocessable } from '../../lib/errors.js';
import { cursorArgs, toPage, type Page, type PaginationQuery } from '../../lib/pagination.js';
import { isUniqueViolation } from '../../lib/prisma-errors.js';
import { toIso } from '../../lib/schemas.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { can } from '../../rbac/permissions.js';
import { guardianRelationSchema } from '../../shared/enums.js';
import { loadDocumentStates, type MemberDocumentState } from '../documents/indicators.js';
import { formatDateOnly, parseDateOnly } from '../documents/status.js';
import type { FileStorage } from '../documents/storage.js';
import { memberScope } from './access.js';
import { importColumns, normalizeImportRow, normalizeHeader } from './csv-columns.js';
import {
  memberFieldsSchema,
  memberGenderSchema,
  memberStatusSchema,
  MAX_IMPORT_ROWS,
  type CreateMemberBody,
  type ExportMembersQuery,
  type ImportMembersBody,
  type ImportMembersResult,
  type ListMembersQuery,
  type MemberDetail,
  type MemberListItem,
  type MemberSummary,
  type UpdateMemberBody,
} from './schema.js';

const memberInclude = {
  teamMemberships: { where: { leftAt: null }, include: { team: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.MemberInclude;

type MemberRow = Prisma.MemberGetPayload<{ include: typeof memberInclude }>;

// Coaches and staff may read members (rosters) but not the identity / address data of minors: minimum access.
function redactsSensitiveFields({ auth }: Pick<TenantRequestContext, 'auth'>): boolean {
  return can(auth.roles, 'members:read') && !can(auth.roles, 'members:write');
}

function toListItem(row: MemberRow, state: MemberDocumentState, redact: boolean): MemberListItem {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    birthDate: row.birthDate ? formatDateOnly(row.birthDate) : null,
    birthPlace: row.birthPlace,
    gender: row.gender === null ? null : memberGenderSchema.parse(row.gender),
    fiscalCode: redact ? null : row.fiscalCode,
    email: row.email,
    phone: row.phone,
    address: redact ? null : row.address,
    city: row.city,
    postalCode: redact ? null : row.postalCode,
    fieldRole: row.fieldRole,
    kitSize: row.kitSize,
    status: memberStatusSchema.parse(row.status),
    joinedAt: row.joinedAt ? formatDateOnly(row.joinedAt) : null,
    notes: redact ? null : row.notes,
    teams: row.teamMemberships.map(({ team, position, jerseyNumber }) => ({
      id: team.id,
      name: team.name,
      category: team.category,
      position,
      jerseyNumber,
    })),
    documents: state.indicators,
    documentStatus: state.overall,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function stateOf(states: Map<string, MemberDocumentState>, memberId: string): MemberDocumentState {
  return states.get(memberId) ?? { indicators: [], overall: 'OK' };
}

function buildWhere(ctx: TenantRequestContext, filters: ExportMembersQuery): Prisma.MemberWhereInput {
  const words = (filters.q ?? '').split(/\s+/).filter((word) => word !== '');
  return {
    AND: [
      memberScope(ctx, 'members:read'),
      filters.status ? { status: filters.status } : {},
      filters.teamId ? { teamMemberships: { some: { teamId: filters.teamId, leftAt: null } } } : {},
      ...words.map((word) => ({
        OR: [
          { firstName: { contains: word } },
          { lastName: { contains: word } },
          { fiscalCode: { contains: word } },
          { email: { contains: word } },
        ],
      })),
    ],
  };
}

export async function listMembers(
  ctx: TenantRequestContext,
  filters: ListMembersQuery,
  query: PaginationQuery,
  now = new Date(),
): Promise<Page<MemberListItem>> {
  const base = buildWhere(ctx, filters);
  let where = base;
  let known = new Map<string, MemberDocumentState>();

  if (filters.documentStatus) {
    // The aggregated status is derived from documents, so it is computed for the candidates first.
    const candidates = await ctx.db.member.findMany({ where: base, select: { id: true } });
    known = await loadDocumentStates(ctx, candidates.map((candidate) => candidate.id), now);
    const matching = candidates.filter((candidate) => stateOf(known, candidate.id).overall === filters.documentStatus);
    where = { AND: [base, { id: { in: matching.map((candidate) => candidate.id) } }] };
  }

  const rows = await ctx.db.member.findMany({
    where,
    include: memberInclude,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    ...cursorArgs(query),
  });
  const page = toPage(rows, query);
  const states = filters.documentStatus ? known : await loadDocumentStates(ctx, page.data.map((row) => row.id), now);
  const redact = redactsSensitiveFields(ctx);
  return { data: page.data.map((row) => toListItem(row, stateOf(states, row.id), redact)), page: page.page };
}

export async function getMember(ctx: TenantRequestContext, id: string, now = new Date()): Promise<MemberDetail> {
  const row = await ctx.db.member.findFirst({
    where: { AND: [{ id }, memberScope(ctx, 'members:read')] },
    include: { ...memberInclude, guardianLinks: { include: { guardian: { select: { firstName: true, lastName: true } } } } },
  });
  if (!row) throw notFound('Member');
  const states = await loadDocumentStates(ctx, [row.id], now);
  return {
    ...toListItem(row, stateOf(states, row.id), redactsSensitiveFields(ctx)),
    guardians: row.guardianLinks.map((link) => ({
      linkId: link.id,
      userId: link.guardianUserId,
      firstName: link.guardian.firstName,
      lastName: link.guardian.lastName,
      relation: guardianRelationSchema.parse(link.relation),
    })),
  };
}

// Ids coming from the client are checked through the scoped client: a foreign-tenant team looks "not found".
async function assertTeamsExist({ db }: TenantRequestContext, teamIds: readonly string[]): Promise<void> {
  const unique = [...new Set(teamIds)];
  if (unique.length === 0) return;
  if ((await db.team.count({ where: { id: { in: unique } } })) !== unique.length) throw notFound('Team');
}

interface DateFields {
  birthDate?: string | null;
  joinedAt?: string | null;
}

function dateData({ birthDate, joinedAt }: DateFields): { birthDate?: Date | null; joinedAt?: Date | null } {
  return {
    ...(birthDate !== undefined ? { birthDate: birthDate === null ? null : parseDateOnly(birthDate) } : {}),
    ...(joinedAt !== undefined ? { joinedAt: joinedAt === null ? null : parseDateOnly(joinedAt) } : {}),
  };
}

export async function createMember(ctx: TenantRequestContext, body: CreateMemberBody): Promise<MemberDetail> {
  await assertTeamsExist(ctx, body.teamIds);
  const { teamIds, birthDate, joinedAt, ...fields } = body;
  const societyId = ctx.auth.societyId;
  try {
    const created = await ctx.db.member.create({
      data: {
        ...fields,
        ...dateData({ birthDate, joinedAt }),
        societyId,
        teamMemberships: { create: [...new Set(teamIds)].map((teamId) => ({ societyId, teamId, joinedAt: new Date() })) },
      },
      select: { id: true },
    });
    return await getMember(ctx, created.id);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('fiscal_code_taken', 'A member with this fiscal code already exists');
    throw error;
  }
}

export async function updateMember(ctx: TenantRequestContext, id: string, body: UpdateMemberBody): Promise<MemberDetail> {
  const { teamIds, birthDate, joinedAt, ...fields } = body;
  const societyId = ctx.auth.societyId;
  if (teamIds) await assertTeamsExist(ctx, teamIds);
  const wanted = teamIds ? [...new Set(teamIds)] : null;
  const now = new Date();
  try {
    // A missing / foreign-tenant id makes Prisma throw P2025, mapped to 404 by the error plugin.
    await ctx.db.member.update({
      where: { id },
      data: {
        ...fields,
        ...dateData({ birthDate, joinedAt }),
        ...(wanted
          ? {
              // Leaving a team keeps the row (history); joining again reopens it.
              teamMemberships: {
                updateMany: { where: { leftAt: null, teamId: { notIn: wanted } }, data: { leftAt: now } },
                upsert: wanted.map((teamId) => ({
                  where: { teamId_memberId: { teamId, memberId: id } },
                  create: { societyId, teamId, joinedAt: now },
                  update: { leftAt: null },
                })),
              },
            }
          : {}),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict('fiscal_code_taken', 'A member with this fiscal code already exists');
    throw error;
  }
  return getMember(ctx, id);
}

// Right to erasure (GDPR): removes the member, their documents and the stored files.
export async function deleteMember({ db }: TenantRequestContext, id: string, storage: FileStorage): Promise<void> {
  const files = await db.document.findMany({ where: { memberId: id }, select: { fileKey: true } });
  const result = await db.member.deleteMany({ where: { id } });
  if (result.count === 0) throw notFound('Member');
  for (const { fileKey } of files) if (fileKey) await storage.remove(fileKey);
}

export async function getSummary(ctx: TenantRequestContext, now = new Date()): Promise<MemberSummary> {
  const [active, squadre] = await Promise.all([
    ctx.db.member.findMany({ where: { status: 'ACTIVE' }, select: { id: true } }),
    ctx.db.team.count(),
  ]);
  const states = await loadDocumentStates(ctx, active.map((member) => member.id), now);
  let missing = 0;
  for (const { indicators } of states.values()) {
    missing += indicators.filter((indicator) => indicator.status === 'MISSING' || indicator.status === 'EXPIRED').length;
  }
  return { tesserati: active.length, squadre, documentiMancanti: missing };
}

// ---------------------------------------------------------------------------------------------------------------
// CSV export / import
// ---------------------------------------------------------------------------------------------------------------

export async function exportMembersCsv(ctx: TenantRequestContext, filters: ExportMembersQuery, now = new Date()): Promise<string> {
  const rows = await ctx.db.member.findMany({
    where: buildWhere(ctx, filters),
    include: memberInclude,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
  });
  const states = await loadDocumentStates(ctx, rows.map((row) => row.id), now);
  const header = [...importColumns.map((column) => column.header), 'statoDocumenti'];
  const body = rows.map((row) => {
    const item = toListItem(row, stateOf(states, row.id), false);
    return [...importColumns.map((column) => column.read(item)), item.documentStatus];
  });
  return toCsv([header, ...body]);
}

interface ParsedRow {
  record: number;
  fields: ReturnType<typeof memberFieldsSchema.parse>;
  teamIds: string[];
}

export async function importMembers(ctx: TenantRequestContext, body: ImportMembersBody): Promise<ImportMembersResult> {
  let records: string[][];
  try {
    records = parseCsv(body.csv);
  } catch (error) {
    if (error instanceof CsvParseError) throw unprocessable('invalid_csv', error.message);
    throw error;
  }
  const [headerRecord, ...dataRecords] = records;
  if (!headerRecord) throw unprocessable('invalid_csv', 'The CSV is empty');
  if (dataRecords.length > MAX_IMPORT_ROWS) {
    throw unprocessable('too_many_rows', `At most ${MAX_IMPORT_ROWS} rows can be imported at once`);
  }

  const columns = headerRecord.map((header) => importColumns.find((column) => column.aliases.includes(normalizeHeader(header))));
  const ignoredColumns = headerRecord.filter((_, index) => !columns[index]).map((header) => header.trim());
  for (const required of ['firstName', 'lastName'] as const) {
    if (!columns.some((column) => column?.field === required)) {
      throw unprocessable('invalid_csv', `Missing required column: ${required === 'firstName' ? 'nome' : 'cognome'}`);
    }
  }

  const teams = await ctx.db.team.findMany({ select: { id: true, name: true } });
  const teamByName = new Map(teams.map((team) => [team.name.toLowerCase(), team.id]));
  const errors: ImportMembersResult['errors'] = [];
  const valid: ParsedRow[] = [];
  const seenFiscalCodes = new Set<string>();

  dataRecords.forEach((cells, index) => {
    const record = index + 2;
    const normalized = normalizeImportRow(columns, cells);
    const parsed = memberFieldsSchema.safeParse(normalized.fields);
    const rowErrors = parsed.success
      ? []
      : parsed.error.issues.map((issue) => ({ row: record, field: String(issue.path[0] ?? '') || null, message: issue.message }));

    const teamIds: string[] = [];
    for (const name of normalized.teamNames) {
      const teamId = teamByName.get(name.toLowerCase());
      if (teamId) teamIds.push(teamId);
      else rowErrors.push({ row: record, field: 'teams', message: `Unknown team "${name}"` });
    }
    if (parsed.success && parsed.data.fiscalCode) {
      if (seenFiscalCodes.has(parsed.data.fiscalCode)) {
        rowErrors.push({ row: record, field: 'fiscalCode', message: 'Duplicate fiscal code in the file' });
      }
      seenFiscalCodes.add(parsed.data.fiscalCode);
    }

    if (rowErrors.length > 0 || !parsed.success) errors.push(...rowErrors);
    else valid.push({ record, fields: parsed.data, teamIds });
  });

  // Fiscal codes already registered in the society.
  const codes = valid.flatMap((row) => (row.fields.fiscalCode ? [row.fields.fiscalCode] : []));
  const existing = codes.length === 0 ? [] : await ctx.db.member.findMany({ where: { fiscalCode: { in: codes } }, select: { fiscalCode: true } });
  const taken = new Set(existing.map((member) => member.fiscalCode));
  const importable = valid.filter((row) => {
    const duplicate = row.fields.fiscalCode !== undefined && taken.has(row.fields.fiscalCode);
    if (duplicate) errors.push({ row: row.record, field: 'fiscalCode', message: 'A member with this fiscal code already exists' });
    return !duplicate;
  });

  let created = 0;
  if (!body.dryRun) {
    const societyId = ctx.auth.societyId;
    for (const row of importable) {
      const { birthDate, joinedAt, ...fields } = row.fields;
      try {
        await ctx.db.member.create({
          data: {
            ...fields,
            ...dateData({ birthDate, joinedAt }),
            societyId,
            teamMemberships: { create: [...new Set(row.teamIds)].map((teamId) => ({ societyId, teamId, joinedAt: new Date() })) },
          },
          select: { id: true },
        });
        created += 1;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        errors.push({ row: row.record, field: 'fiscalCode', message: 'A member with this fiscal code already exists' });
      }
    }
  }

  errors.sort((a, b) => a.row - b.row);
  const invalidRows = new Set(errors.map((error) => error.row)).size;
  return {
    dryRun: body.dryRun,
    totalRows: dataRecords.length,
    validRows: dataRecords.length - invalidRows,
    invalidRows,
    created,
    ignoredColumns,
    errors,
  };
}
