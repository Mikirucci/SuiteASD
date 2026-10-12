import type { MemberListItem } from './schema.js';

// Column map shared by the CSV export (header names) and import (accepted aliases, Italian and English).
// Export writes the first alias form below as `header`, so an exported file can be imported back.

type ImportField =
  | 'firstName'
  | 'lastName'
  | 'birthDate'
  | 'birthPlace'
  | 'gender'
  | 'fiscalCode'
  | 'email'
  | 'phone'
  | 'address'
  | 'city'
  | 'postalCode'
  | 'fieldRole'
  | 'kitSize'
  | 'status'
  | 'joinedAt'
  | 'notes'
  | 'teams';

export interface ImportColumn {
  field: ImportField;
  header: string;
  aliases: readonly string[];
  read: (member: MemberListItem) => string | null;
}

const plain =
  (field: Exclude<ImportField, 'teams'>) =>
  (member: MemberListItem): string | null =>
    member[field];

export const importColumns: readonly ImportColumn[] = [
  { field: 'firstName', header: 'nome', aliases: ['nome', 'firstname'], read: plain('firstName') },
  { field: 'lastName', header: 'cognome', aliases: ['cognome', 'lastname'], read: plain('lastName') },
  { field: 'birthDate', header: 'dataNascita', aliases: ['datanascita', 'datadinascita', 'nascita', 'birthdate'], read: plain('birthDate') },
  { field: 'birthPlace', header: 'luogoNascita', aliases: ['luogonascita', 'luogodinascita', 'birthplace'], read: plain('birthPlace') },
  { field: 'gender', header: 'sesso', aliases: ['sesso', 'genere', 'gender'], read: plain('gender') },
  { field: 'fiscalCode', header: 'codiceFiscale', aliases: ['codicefiscale', 'cf', 'fiscalcode'], read: plain('fiscalCode') },
  { field: 'email', header: 'email', aliases: ['email', 'mail'], read: plain('email') },
  { field: 'phone', header: 'telefono', aliases: ['telefono', 'cellulare', 'phone'], read: plain('phone') },
  { field: 'address', header: 'indirizzo', aliases: ['indirizzo', 'address'], read: plain('address') },
  { field: 'city', header: 'citta', aliases: ['citta', 'comune', 'city'], read: plain('city') },
  { field: 'postalCode', header: 'cap', aliases: ['cap', 'postalcode'], read: plain('postalCode') },
  { field: 'fieldRole', header: 'ruolo', aliases: ['ruolo', 'ruolocampo', 'fieldrole'], read: plain('fieldRole') },
  { field: 'kitSize', header: 'taglia', aliases: ['taglia', 'tagliadivisa', 'kitsize'], read: plain('kitSize') },
  { field: 'status', header: 'stato', aliases: ['stato', 'status'], read: plain('status') },
  { field: 'joinedAt', header: 'dataTesseramento', aliases: ['datatesseramento', 'tesseratodal', 'joinedat'], read: plain('joinedAt') },
  { field: 'teams', header: 'squadre', aliases: ['squadre', 'squadra', 'team', 'teams'], read: (member) => member.teams.map((team) => team.name).join('|') },
];

// "Data di nascita" -> "datadinascita": case, accents, spaces and punctuation do not matter.
export function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const GENDERS: Record<string, string> = { f: 'FEMALE', femmina: 'FEMALE', donna: 'FEMALE', m: 'MALE', maschio: 'MALE', uomo: 'MALE' };
const STATUSES: Record<string, string> = { attivo: 'ACTIVE', attiva: 'ACTIVE', inattivo: 'INACTIVE', inattiva: 'INACTIVE', nonattivo: 'INACTIVE' };

function normalizeValue(field: ImportField, raw: string): string {
  // Undo the formula guard applied by the export ("'+39..." -> "+39...").
  const value = /^'[=+\-@\t\r]/.test(raw) ? raw.slice(1) : raw;
  switch (field) {
    case 'birthDate':
    case 'joinedAt': {
      const italian = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
      return italian ? `${italian[3]}-${(italian[2] ?? '').padStart(2, '0')}-${(italian[1] ?? '').padStart(2, '0')}` : value;
    }
    case 'gender':
      return GENDERS[value.toLowerCase()] ?? value.toUpperCase();
    case 'status':
      return STATUSES[value.toLowerCase().replace(/\s+/g, '')] ?? value.toUpperCase();
    default:
      return value;
  }
}

export interface NormalizedRow {
  fields: Partial<Record<Exclude<ImportField, 'teams'>, string>>;
  teamNames: string[];
}

// Empty cells are treated as "not provided".
export function normalizeImportRow(columns: readonly (ImportColumn | undefined)[], cells: readonly string[]): NormalizedRow {
  const row: NormalizedRow = { fields: {}, teamNames: [] };
  columns.forEach((column, index) => {
    const raw = cells[index]?.trim() ?? '';
    if (!column || raw === '') return;
    if (column.field === 'teams') {
      row.teamNames.push(...raw.split('|').map((name) => name.trim()).filter((name) => name !== ''));
    } else {
      row.fields[column.field] = normalizeValue(column.field, raw);
    }
  });
  return row;
}
