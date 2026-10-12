import type { PrismaClient } from '@prisma/client';
import type { PasswordHasher } from '../../src/lib/password.js';

export const DEMO_SOCIETY_SLUG = 'aquile-volley';
export const DEMO_PASSWORD = 'Demo1234!';

export interface DemoUser {
  id: string;
  email: string;
}

// Shared state handed to every seed step. Steps add what later steps need (e.g. team and member ids).
export interface SeedContext {
  prisma: PrismaClient;
  passwords: PasswordHasher;
  societyId: string;
  users: Record<'admin' | 'segreteria' | 'allenatore' | 'staff' | 'atleta' | 'genitore', DemoUser>;
  teamIds: Record<string, string>;
  memberIds: Record<string, string>;
}

// One seed step per module: `prisma/seed/<module>.ts` exports a SeedStep, registered in index.ts.
export type SeedStep = (context: SeedContext) => Promise<void>;
