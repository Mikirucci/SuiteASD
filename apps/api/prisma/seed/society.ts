import type { PrismaClient } from '@prisma/client';
import { createDefaultDocumentTypes } from '../../src/lib/society-defaults.js';
import type { PasswordHasher } from '../../src/lib/password.js';
import type { Role } from '../../src/shared/enums.js';
import { DEMO_PASSWORD, DEMO_SOCIETY_SLUG, type SeedContext } from './context.js';

interface DemoUserSpec {
  key: keyof SeedContext['users'];
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
}

const DEMO_USERS: readonly DemoUserSpec[] = [
  { key: 'admin', email: 'admin@aquilevolley.it', firstName: 'Paolo', lastName: 'Marchetti', role: 'ADMIN' },
  { key: 'segreteria', email: 'segreteria@aquilevolley.it', firstName: 'Laura', lastName: 'Gentile', role: 'SEGRETERIA' },
  { key: 'allenatore', email: 'allenatore@aquilevolley.it', firstName: 'Marco', lastName: 'Villa', role: 'ALLENATORE' },
  { key: 'staff', email: 'staff@aquilevolley.it', firstName: 'Franco', lastName: 'Galli', role: 'STAFF' },
  { key: 'atleta', email: 'atleta@aquilevolley.it', firstName: 'Giulia', lastName: 'Rossi', role: 'ATLETA' },
  { key: 'genitore', email: 'genitore@aquilevolley.it', firstName: 'Roberta', lastName: 'Conti', role: 'GENITORE' },
];

// Wipes the previous demo society (cascade) and demo accounts, then recreates them: the seed is re-runnable.
export async function seedSociety(prisma: PrismaClient, passwords: PasswordHasher): Promise<SeedContext> {
  await prisma.society.deleteMany({ where: { slug: DEMO_SOCIETY_SLUG } });
  await prisma.user.deleteMany({ where: { email: { in: DEMO_USERS.map((user) => user.email) } } });

  const society = await prisma.society.create({
    data: {
      name: 'Aquile Volley',
      slug: DEMO_SOCIETY_SLUG,
      sport: 'VOLLEY',
      email: 'info@aquilevolley.it',
      city: 'Bologna',
    },
  });
  await createDefaultDocumentTypes(prisma, society.id);

  const passwordHash = await passwords.hash(DEMO_PASSWORD);
  const users = {} as SeedContext['users'];
  for (const spec of DEMO_USERS) {
    const user = await prisma.user.create({
      data: { email: spec.email, passwordHash, firstName: spec.firstName, lastName: spec.lastName },
    });
    await prisma.membership.create({ data: { societyId: society.id, userId: user.id, role: spec.role } });
    users[spec.key] = { id: user.id, email: user.email };
  }

  return { prisma, passwords, societyId: society.id, users, teamIds: {}, memberIds: {} };
}
