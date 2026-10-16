import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { inject } from 'vitest';
import { sqliteUrl } from './db-url.js';
import { buildApp } from '../../src/app.js';
import { loadConfig, type AppConfig } from '../../src/config/env.js';
import type { EmailTransport } from '../../src/lib/email.js';

export const API = '/api/v1';

export interface TestContext {
  app: FastifyInstance;
  prisma: PrismaClient;
  config: AppConfig;
  close(): Promise<void>;
}

// Builds a full app on a private copy of the migrated SQLite database: test files are fully isolated
// from each other and from the dev database. Inside a file, isolate tests by creating a new society.
// `email` replaces the email provider (default: none, as RESEND_API_KEY is unset).
export async function createTestContext(
  overrides: Record<string, string> = {},
  options: { email?: EmailTransport | null } = {},
): Promise<TestContext> {
  const dir = mkdtempSync(join(tmpdir(), 'suiteasd-test-'));
  const dbFile = join(dir, 'test.db');
  copyFileSync(inject('templateDb'), dbFile);

  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: sqliteUrl(dbFile),
    JWT_SECRET: 'test-secret-test-secret-test-secret-test-secret',
    ARGON2_MEMORY_KIB: '1024',
    RATE_LIMIT_MAX: '100000',
    AUTH_RATE_LIMIT_MAX: '100000',
    ...overrides,
  });
  const prisma = new PrismaClient({ datasourceUrl: config.DATABASE_URL });
  const app = await buildApp({ config, prisma, email: options.email ?? null });
  await app.ready();

  return {
    app,
    prisma,
    config,
    async close() {
      await app.close();
      await prisma.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
