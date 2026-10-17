import { Prisma } from '@prisma/client';
import { CsvParseError, parseCsv } from '../../lib/csv.js';
import { unprocessable } from '../../lib/errors.js';
import type { TenantRequestContext } from '../../plugins/auth.js';
import { addTeamConvocations } from '../convocations/auto.js';
import { zonedTimeToUtc } from '../events/recurrence.js';
import { normalizeHeader } from '../members/csv-columns.js';
import { validateMatchResult } from './match-result.js';
import type { ImportMatchesBody, ImportMatchesResult } from './schema.js';

// Import of the calendar and the results of a group from a file (docs/DECISIONS.md D-25). The federations publish
// calendars and results as pages and PDFs, not as a feed we could rely on: the secretary exports or pastes them
// into a spreadsheet and saves it as CSV. One row = one match. Teams are created as they appear, the matches of
// our own teams get a calendar event (so they can be convocated), results are set when the row has them.

export const MAX_MATCH_ROWS = 500;
const TIME_ZONE = 'Europe/Rome';

type Field = 'round' | 'date' | 'time' | 'home' | 'away' | 'homeSets' | 'awaySets' | 'result';

const ALIASES: Record<Field, readonly string[]> = {
  round: ['giornata', 'round', 'turno', 'g'],
  date: ['data', 'date', 'giorno'],
  time: ['ora', 'orario', 'time'],
  home: ['casa', 'squadracasa', 'home', 'squadra1', 'squadradicasa'],
  away: ['ospite', 'trasferta', 'squadraospite', 'away', 'squadra2', 'squadraospite'],
  homeSets: ['setcasa', 'setvintidallacasa', 'homesets', 'setc'],
  awaySets: ['setospite', 'awaysets', 'seto'],
  result: ['risultato', 'result', 'esito', 'punteggio'],
};

export interface RowProblem {
  row: number;
  field: string | null;
  message: string;
}

export interface ParsedMatchRow {
  /** 1-based record number counting the header as record 1. */
  record: number;
  round: number | null;
  /** The instant of the match; null when the row has no date. */
  playedAt: Date | null;
  home: string;
  away: string;
  homeSets: number | null;
  awaySets: number | null;
}

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

function parseDate(text: string): { year: number; month: number; day: number } | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const italian = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
  let parts: [number, number, number] | null = null;
  if (iso) parts = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (italian) {
    const year = Number(italian[3]);
    parts = [year < 100 ? 2000 + year : year, Number(italian[2]), Number(italian[1])];
  }
  if (!parts) return null;
  const [year, month, day] = parts;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

function parseTime(text: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2})[:.](\d{2})$/.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

function parseSets(text: string): number | null {
  return /^\d$/.test(text) ? Number(text) : null;
}

// "3-1", "3 - 1" and "3:1" mean 3 sets to 1.
function parseResult(text: string): [number, number] | null {
  const match = /^(\d)\s*[-:]\s*(\d)$/.exec(text);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

export function parseMatchRows(csv: string): { rows: ParsedMatchRow[]; problems: RowProblem[]; ignoredColumns: string[] } {
  let records: string[][];
  try {
    records = parseCsv(csv);
  } catch (error) {
    if (error instanceof CsvParseError) throw unprocessable('invalid_csv', error.message);
    throw error;
  }
  const [headerRecord, ...dataRecords] = records;
  if (!headerRecord) throw unprocessable('invalid_csv', 'The CSV is empty');

  const columnOf = new Map<Field, number>();
  const ignoredColumns: string[] = [];
  headerRecord.forEach((header, index) => {
    const key = normalizeHeader(header);
    const field = (Object.keys(ALIASES) as Field[]).find((candidate) => ALIASES[candidate].includes(key));
    if (field && !columnOf.has(field)) columnOf.set(field, index);
    else if (header.trim() !== '') ignoredColumns.push(header.trim());
  });
  if (!columnOf.has('home') || !columnOf.has('away')) {
    throw unprocessable('missing_columns', 'The file needs a column for the home team (casa) and one for the away team (ospite)');
  }
  if (dataRecords.length > MAX_MATCH_ROWS) {
    throw unprocessable('too_many_rows', `At most ${MAX_MATCH_ROWS} matches can be imported at once`);
  }

  const rows: ParsedMatchRow[] = [];
  const problems: RowProblem[] = [];
  dataRecords.forEach((record, index) => {
    const number = index + 2;
    const cell = (field: Field): string => (record[columnOf.get(field) ?? -1] ?? '').trim();
    const fail = (field: string, message: string): undefined => {
      problems.push({ row: number, field, message });
      return undefined;
    };

    const home = cell('home');
    const away = cell('away');
    if (home === '' || away === '') { fail(home === '' ? 'casa' : 'ospite', 'The team name is missing'); return; }
    if (sameName(home, away)) { fail('ospite', 'A team cannot play against itself'); return; }

    const roundText = cell('round');
    const round = roundText === '' ? null : /^\d{1,3}$/.test(roundText) && Number(roundText) >= 1 ? Number(roundText) : undefined;
    if (round === undefined) { fail('giornata', 'The round must be a number from 1'); return; }

    const dateText = cell('date');
    const timeText = cell('time');
    let playedAt: Date | null = null;
    if (dateText !== '') {
      const date = parseDate(dateText);
      if (!date) { fail('data', 'The date is not valid: use gg/mm/aaaa or aaaa-mm-gg'); return; }
      const time = timeText === '' ? { hour: 0, minute: 0 } : parseTime(timeText);
      if (!time) { fail('ora', 'The time is not valid: use hh:mm'); return; }
      playedAt = zonedTimeToUtc({ ...date, ...time, second: 0 }, TIME_ZONE);
    } else if (timeText !== '') {
      fail('data', 'A time needs a date'); return;
    }

    let homeSets: number | null = null;
    let awaySets: number | null = null;
    const combined = cell('result');
    if (combined !== '') {
      const parsed = parseResult(combined);
      if (!parsed) { fail('risultato', 'The result must look like 3-1'); return; }
      [homeSets, awaySets] = parsed;
    } else {
      const homeText = cell('homeSets');
      const awayText = cell('awaySets');
      if (homeText !== '' || awayText !== '') {
        homeSets = parseSets(homeText);
        awaySets = parseSets(awayText);
        if (homeSets === null || awaySets === null) { fail('set', 'Both set counts are needed, as single digits'); return; }
      }
    }
    if (homeSets !== null && awaySets !== null) {
      const errors = validateMatchResult({ homeSets, awaySets });
      if (errors.length > 0) { fail('risultato', errors[0]?.message ?? 'The result is not valid'); return; }
    }
    rows.push({ record: number, round, playedAt, home, away, homeSets, awaySets });
  });
  return { rows, problems, ignoredColumns };
}

const sameDay = (a: Date, b: Date): boolean => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

interface Participant {
  id: string | null; // null: created by this import
  name: string;
  teamId: string | null;
}

interface PlannedMatch {
  row: ParsedMatchRow;
  existingId: string | null;
  needsEvent: boolean;
}

export async function importMatches(
  ctx: TenantRequestContext,
  competitionId: string,
  groupId: string,
  body: ImportMatchesBody,
): Promise<ImportMatchesResult> {
  const { db, auth } = ctx;
  const group = await db.group.findFirst({ where: { id: groupId, competitionId }, select: { id: true } });
  if (!group) throw unprocessable('group_not_found', 'The group does not exist in this competition');

  const parsed = parseMatchRows(body.csv);
  const problems = [...parsed.problems];

  const [groupTeams, ourTeams, existing] = await Promise.all([
    db.groupTeam.findMany({ where: { groupId } }),
    db.team.findMany({ select: { id: true, name: true } }),
    db.match.findMany({
      where: { groupId },
      include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
    }),
  ]);
  const participants: Participant[] = groupTeams.map((team) => ({ id: team.id, name: team.name, teamId: team.teamId }));
  const usedTeamIds = new Set(groupTeams.flatMap((team) => (team.teamId ? [team.teamId] : [])));
  const created: Participant[] = [];

  // A name already in the group is that participant; a name equal to one of our teams becomes our team.
  const participantFor = (name: string): Participant => {
    const known = participants.find((candidate) => sameName(candidate.name, name));
    if (known) return known;
    const ours = ourTeams.find((team) => sameName(team.name, name) && !usedTeamIds.has(team.id));
    if (ours) usedTeamIds.add(ours.id);
    const participant: Participant = { id: null, name: name.trim(), teamId: ours?.id ?? null };
    participants.push(participant);
    created.push(participant);
    return participant;
  };

  const plan: PlannedMatch[] = [];
  const seen = new Set<string>();
  for (const row of parsed.rows) {
    const home = participantFor(row.home);
    const away = participantFor(row.away);
    const key = `${home.name.toLowerCase()}|${away.name.toLowerCase()}|${row.round ?? (row.playedAt ? row.playedAt.toISOString().slice(0, 10) : '')}`;
    if (seen.has(key)) {
      problems.push({ row: row.record, field: null, message: 'The same match appears twice in the file' });
      continue;
    }
    seen.add(key);

    const match = existing.find(
      (candidate) =>
        sameName(candidate.homeTeam.name, home.name) &&
        sameName(candidate.awayTeam.name, away.name) &&
        (row.round !== null
          ? candidate.round === row.round
          : row.playedAt !== null
            ? candidate.playedAt !== null && sameDay(candidate.playedAt, row.playedAt)
            : true),
    );
    const ourSide = home.teamId !== null || away.teamId !== null;
    const hasResult = row.homeSets !== null;
    plan.push({
      row,
      existingId: match?.id ?? null,
      needsEvent: ourSide && row.playedAt !== null && !hasResult && !match?.eventId,
    });
  }

  const invalidRows = new Set(problems.map((problem) => problem.row)).size;
  const result: ImportMatchesResult = {
    dryRun: body.dryRun,
    totalRows: parsed.rows.length + parsed.problems.length,
    validRows: plan.length,
    invalidRows,
    teamsCreated: created.length,
    matchesCreated: plan.filter((item) => item.existingId === null).length,
    matchesUpdated: plan.filter((item) => item.existingId !== null).length,
    resultsSet: plan.filter((item) => item.row.homeSets !== null).length,
    eventsCreated: plan.filter((item) => item.needsEvent).length,
    ignoredColumns: parsed.ignoredColumns,
    errors: problems.sort((a, b) => a.row - b.row),
  };
  if (body.dryRun || plan.length === 0) return result;

  await db.$transaction(async (tx) => {
    const ids = new Map<string, string>();
    for (const team of groupTeams) ids.set(team.name.toLowerCase(), team.id);
    for (const participant of created) {
      const row = await tx.groupTeam.create({
        data: { societyId: auth.societyId, groupId, name: participant.name, teamId: participant.teamId },
      });
      ids.set(participant.name.toLowerCase(), row.id);
    }
    const idOf = (name: string): string => {
      const id = ids.get(name.trim().toLowerCase());
      if (!id) throw new Error(`Participant "${name}" was not created`);
      return id;
    };

    for (const { row, existingId, needsEvent } of plan) {
      const home = participants.find((candidate) => sameName(candidate.name, row.home));
      const away = participants.find((candidate) => sameName(candidate.name, row.away));
      let eventId: string | undefined;
      if (needsEvent && row.playedAt) {
        const event = await tx.event.create({
          data: {
            societyId: auth.societyId,
            type: 'MATCH',
            title: `${row.home.trim()} vs ${row.away.trim()}`,
            startsAt: row.playedAt,
            teamId: home?.teamId ?? away?.teamId ?? null,
          },
          select: { id: true, teamId: true, startsAt: true, status: true },
        });
        eventId = event.id;
        await addTeamConvocations(tx, auth.societyId, [event]);
      }
      const resultData =
        row.homeSets !== null && row.awaySets !== null
          ? { status: 'PLAYED', homeSets: row.homeSets, awaySets: row.awaySets, setScores: Prisma.DbNull }
          : {};
      if (existingId) {
        await tx.match.update({
          where: { id: existingId },
          data: { ...(row.round !== null ? { round: row.round } : {}), ...(row.playedAt ? { playedAt: row.playedAt } : {}), ...(eventId ? { eventId } : {}), ...resultData },
        });
      } else {
        await tx.match.create({
          data: {
            societyId: auth.societyId,
            groupId,
            round: row.round,
            homeTeamId: idOf(row.home),
            awayTeamId: idOf(row.away),
            playedAt: row.playedAt,
            ...(eventId ? { eventId } : {}),
            ...resultData,
          },
        });
      }
    }
  });
  return result;
}
