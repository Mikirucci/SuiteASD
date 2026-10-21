import type { Prisma } from '@prisma/client';
import { notFound } from '../../lib/errors.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { memberScope } from '../members/access.js';
import type { DocumentTypeReportDto, TypePeopleDto, TypePeopleQuery, TypePerson, TypeStats } from './schema.js';
import { daysUntil, formatDateOnly, pickCurrentDocument, statusOfDocument } from './status.js';

// Per-type view of the documents of the active members: who is in order, whose document is about to expire,
// who is late or has nothing on file. A required type concerns every active member; an optional one only those
// who handed it in. Members are limited to what the caller may read (a coach sees their own teams).

const memberSelect = {
  id: true,
  firstName: true,
  lastName: true,
  teamMemberships: { where: { leftAt: null }, select: { team: { select: { id: true, name: true } } } },
} satisfies Prisma.MemberSelect;

type MemberRow = Prisma.MemberGetPayload<{ select: typeof memberSelect }>;

interface TypeInfo {
  id: string;
  requiresExpiry: boolean;
  isRequired: boolean;
}

interface DocumentRow {
  id: string;
  memberId: string;
  documentTypeId: string;
  expiresAt: Date | null;
  fileKey: string | null;
}

const documentSelect = { id: true, memberId: true, documentTypeId: true, expiresAt: true, fileKey: true } satisfies Prisma.DocumentSelect;

function personOf(member: MemberRow, type: TypeInfo, documents: readonly DocumentRow[], now: Date): TypePerson | null {
  const current = pickCurrentDocument(documents, type.requiresExpiry);
  if (!current && !type.isRequired) return null;
  const expiresAt = type.requiresExpiry ? (current?.expiresAt ?? null) : null;
  return {
    memberId: member.id,
    memberName: `${member.firstName} ${member.lastName}`,
    teams: member.teamMemberships.map((membership) => membership.team),
    status: statusOfDocument(current, type.requiresExpiry, now),
    documentId: current?.id ?? null,
    expiresAt: expiresAt ? formatDateOnly(expiresAt) : null,
    daysRemaining: expiresAt ? daysUntil(expiresAt, now) : null,
    hasFile: current?.fileKey != null,
  };
}

function statsOf(people: readonly TypePerson[]): TypeStats {
  const count = (status: TypePerson['status']) => people.filter((person) => person.status === status).length;
  return { validPeople: count('OK'), expiringPeople: count('EXPIRING'), expiredPeople: count('EXPIRED'), missingPeople: count('MISSING') };
}

function loadMembers(ctx: TenantRequestContext): Promise<MemberRow[]> {
  return ctx.db.member.findMany({
    where: { AND: [memberScope(ctx, 'documents:read'), { status: 'ACTIVE' }] },
    select: memberSelect,
  });
}

function peopleOfType(members: readonly MemberRow[], type: TypeInfo, documents: readonly DocumentRow[], now: Date): TypePerson[] {
  const byMember = new Map<string, DocumentRow[]>();
  for (const document of documents) {
    if (document.documentTypeId === type.id) byMember.set(document.memberId, [...(byMember.get(document.memberId) ?? []), document]);
  }
  return members
    .map((member) => personOf(member, type, byMember.get(member.id) ?? [], now))
    .filter((person): person is TypePerson => person !== null)
    .sort((a, b) => a.memberName.localeCompare(b.memberName, 'it') || a.memberId.localeCompare(b.memberId));
}

export async function documentTypeReport(ctx: TenantRequestContext, now = new Date()): Promise<DocumentTypeReportDto> {
  const [members, types] = await Promise.all([
    loadMembers(ctx),
    ctx.db.documentType.findMany({ select: { id: true, requiresExpiry: true, isRequired: true } }),
  ]);
  const documents = await ctx.db.document.findMany({
    where: { memberId: { in: members.map((member) => member.id) } },
    select: documentSelect,
  });
  const data = types
    .map((type) => ({ documentTypeId: type.id, people: peopleOfType(members, type, documents, now) }))
    .filter(({ people }) => people.length > 0)
    .map(({ documentTypeId, people }) => ({ documentTypeId, ...statsOf(people) }));
  return { data };
}

export async function documentTypePeople(
  ctx: TenantRequestContext,
  documentTypeId: string,
  filters: TypePeopleQuery,
  now = new Date(),
): Promise<TypePeopleDto> {
  const type = await ctx.db.documentType.findFirst({
    where: { id: documentTypeId },
    select: { id: true, requiresExpiry: true, isRequired: true },
  });
  if (!type) throw notFound('Document type');
  const members = await loadMembers(ctx);
  const documents = await ctx.db.document.findMany({
    where: { documentTypeId, memberId: { in: members.map((member) => member.id) } },
    select: documentSelect,
  });
  const everyone = peopleOfType(members, type, documents, now);
  const needle = filters.q?.toLocaleLowerCase('it');
  const people = everyone.filter(
    (person) =>
      (!filters.status || person.status === filters.status) &&
      (!filters.teamId || person.teams.some((team) => team.id === filters.teamId)) &&
      (!needle || person.memberName.toLocaleLowerCase('it').includes(needle)),
  );
  // The figures describe the whole type: searching and filtering narrow the people, not the report.
  return { stats: statsOf(everyone), people };
}
