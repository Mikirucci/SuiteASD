import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { inject } from 'vitest';
import { sqliteUrl } from './db-url.js';
import { buildApp } from '../../src/app.js';
import { loadConfig, type AppConfig } from '../../src/config/env.js';

export const API = '/api/v1';

export interface TestContext {
  app: FastifyInstance;
  prisma: PrismaClient;
  config: AppConfig;
  close(): Promise<void>;
}

// Builds a full app on a private copy of the migrated SQLite database: test files are fully isolated
// from each other and from the dev database. Inside a file, isolate tests by creating a new society.
export async function createTestContext(overrides: Record<string, string> = {}): Promise<TestContext> {
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
  const app = await buildApp({ config, prisma });
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
