import { LINKED_CATEGORIES } from '../../lib/ledger-links.js';
import type { TenantDb } from '../../lib/tenant.js';
import type { LedgerKind } from '../../shared/enums.js';

// The usual categories of a sports club, offered before any has been used. The ones the costs of venues, kits, trips
// and referees are booked under come first: an expense entered by hand can use them too.
export const DEFAULT_CATEGORIES: Record<LedgerKind, readonly string[]> = {
  EXPENSE: [
    ...Object.values(LINKED_CATEGORIES),
    'Attrezzatura sportiva',
    'Iscrizioni e affiliazioni',
    'Assicurazioni',
    'Utenze',
    'Compensi e rimborsi',
    'Ufficio e segreteria',
    'Altro',
  ],
  INCOME: ['Sponsor', 'Quote', 'Contributi', 'Eventi e raccolte fondi', 'Altro'],
};

type CategoryDb = Pick<TenantDb, 'ledgerEntry'>;

const tidy = (name: string): string => name.trim().replace(/\s+/g, ' ');
const sameName = (a: string, b: string): boolean => a.localeCompare(b, 'it', { sensitivity: 'accent' }) === 0;

async function usedCategories(db: CategoryDb, kind: LedgerKind): Promise<string[]> {
  const rows = await db.ledgerEntry.findMany({ where: { kind }, distinct: ['category'], select: { category: true } });
  return rows.map((row) => row.category);
}

// The categories to pick from, by name: what the society has used so far plus the usual ones.
export async function listCategories(db: CategoryDb, kind: LedgerKind): Promise<string[]> {
  const all: string[] = [];
  for (const name of [...(await usedCategories(db, kind)), ...DEFAULT_CATEGORIES[kind]]) {
    if (!all.some((known) => sameName(known, name))) all.push(name);
  }
  return all.sort((a, b) => a.localeCompare(b, 'it'));
}

// "palloni" and "Palloni " are the same category: a name that matches one already in use (or a usual one) takes its
// spelling, so the reports never split one category in two because of a capital letter or a stray space.
export async function canonicalCategory(db: CategoryDb, kind: LedgerKind, name: string): Promise<string> {
  const wanted = tidy(name);
  const known = await listCategories(db, kind);
  return known.find((candidate) => sameName(candidate, wanted)) ?? wanted;
}
