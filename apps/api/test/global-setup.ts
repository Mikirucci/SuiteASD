import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { TestProject } from 'vitest/node';
import { sqliteUrl } from './helpers/db-url.js';

declare module 'vitest' {
  export interface ProvidedContext {
    templateDb: string;
  }
}

const require = createRequire(import.meta.url);

// Applies every migration ONCE to a template SQLite file; each test file then gets its own copy (see helpers/app.ts).
export default function setup(project: TestProject): () => void {
  const dir = mkdtempSync(join(tmpdir(), 'suiteasd-template-'));
  const templateDb = join(dir, 'template.db');
  const prismaCli = join(dirname(require.resolve('prisma/package.json')), 'build', 'index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: sqliteUrl(templateDb) },
    stdio: 'pipe',
  });
  project.provide('templateDb', templateDb);
  return () => rmSync(dir, { recursive: true, force: true });
}
