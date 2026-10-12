import type { PrismaClient } from '@prisma/client';
import type { PasswordHasher } from '../../src/lib/password.js';
import type { SeedContext, SeedStep } from './context.js';
import { seedMembers } from './members.js';
import { seedSociety } from './society.js';
import { seedTeams } from './teams.js';

// Every module adds its own file `prisma/seed/<module>.ts` exporting a SeedStep and appends it below,
// AFTER the steps it depends on. Steps share the SeedContext (ids of the rows created so far).
const STEPS: readonly { name: string; run: SeedStep }[] = [
  { name: 'teams', run: seedTeams },
  { name: 'members', run: seedMembers },
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
