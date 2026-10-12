import { existsSync } from 'node:fs';
import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';
import { builtInAutomations } from './jobs/definitions/index.js';
import { registerAutomation } from './jobs/registry.js';
import { createScheduler } from './jobs/scheduler.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const config = loadConfig();
const app = await buildApp({ config });

let scheduler: ReturnType<typeof createScheduler> | undefined;
if (config.SCHEDULER_ENABLED) {
  for (const automation of builtInAutomations) registerAutomation(automation);
  scheduler = createScheduler({ prisma: app.prisma, log: app.log });
  scheduler.start();
}

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down');
  scheduler?.stop();
  await app.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.fatal({ err: error }, 'failed to start');
  process.exit(1);
}
