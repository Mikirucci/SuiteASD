import { sep } from 'node:path';

// Prisma wants forward slashes in SQLite file URLs, also on Windows.
export function sqliteUrl(file: string): string {
  return `file:${file.split(sep).join('/')}`;
}
