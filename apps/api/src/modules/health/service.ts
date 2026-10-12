import type { PrismaClient } from '@prisma/client';
import type { HealthResponse } from './schema.js';

export async function checkHealth(prisma: PrismaClient): Promise<HealthResponse> {
  let database: HealthResponse['database'] = 'up';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'down';
  }
  return {
    status: database === 'up' ? 'ok' : 'degraded',
    database,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  };
}
