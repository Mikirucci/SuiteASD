import type { PrismaClient } from '@prisma/client';
import type { PasswordHasher } from '../../src/lib/password.js';
import { seedAdministration } from './administration.js';
import type { SeedContext, SeedStep } from './context.js';
import { seedCompetitions } from './competitions.js';
import { seedEvents } from './events.js';
import { seedFees } from './fees.js';
import { seedMemberDocuments } from './members-documents.js';
import { seedMembers } from './members.js';
import { seedSecondary } from './secondary.js';
import { seedSociety } from './society.js';
import { seedTeams } from './teams.js';

// Every module adds its own file `prisma/seed/<module>.ts` exporting a SeedStep and appends it below,
// AFTER the steps it depends on. Steps share the SeedContext (ids of the rows created so far).
const STEPS: readonly { name: string; run: SeedStep }[] = [
  { name: 'teams', run: seedTeams },
  { name: 'members', run: seedMembers },
  { name: 'members-documents', run: seedMemberDocuments },
  { name: 'events', run: seedEvents },
  { name: 'competitions', run: seedCompetitions },
  { name: 'fees', run: seedFees },
  { name: 'secondary', run: seedSecondary },
  { name: 'administration', run: seedAdministration },
];

export async function runSeed(
  prisma: PrismaClient,
  passwords: PasswordHasher,
  onStep: (name: string) => void = () => undefined,
): Promise<SeedContext> {
  const context = await seedSociety(prisma, passwords);
  for (const step of STEPS) {
    await step.run(context);
    onStep(step.name);
  }
  return context;
}
