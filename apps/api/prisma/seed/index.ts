import { existsSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { createPasswordHasher } from '../../src/lib/password.js';
import { DEMO_PASSWORD } from './context.js';
import { runSeed } from './run.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const prisma = new PrismaClient();
try {
  const context = await runSeed(prisma, createPasswordHasher(19456), (name) => {
    console.log(`seeded ${name}`);
  });
  console.log(`\nDemo society "Aquile Volley" ready. Password for every demo account: ${DEMO_PASSWORD}`);
  for (const [role, user] of Object.entries(context.users)) console.log(`  ${role.padEnd(11)} ${user.email}`);
} finally {
  await prisma.$disconnect();
}
