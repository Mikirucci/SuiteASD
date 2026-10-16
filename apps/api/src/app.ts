import helmet from '@fastify/helmet';
import { PrismaClient } from '@prisma/client';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { AppConfig } from './config/env.js';
import { createEmailTransport, type EmailTransport } from './lib/email.js';
import { createPasswordHasher, type PasswordHasher } from './lib/password.js';
import { moduleRoutes } from './modules/index.js';
import { authPlugin } from './plugins/auth.js';
import { errorsPlugin } from './plugins/errors.js';
import { API_PREFIX, openApiPlugin } from './plugins/openapi.js';
import { securityPlugin } from './plugins/security.js';

export interface BuildAppOptions {
  config: AppConfig;
  // Injected in tests; otherwise a client is created from config.DATABASE_URL and closed with the app.
  prisma?: PrismaClient;
  // Email provider (null = none configured, emails are skipped). Defaults to the one described by the config.
  email?: EmailTransport | null;
}

function loggerOptions(config: AppConfig) {
  return {
    level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL,
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    ...(config.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
      : {}),
  };
}

export async function buildApp({ config, prisma, email }: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions(config),
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const client = prisma ?? new PrismaClient({ datasourceUrl: config.DATABASE_URL });
  const passwords: PasswordHasher = createPasswordHasher(config.ARGON2_MEMORY_KIB);
  app.decorate('config', config);
  app.decorate('prisma', client);
  app.decorate('passwords', passwords);
  app.decorate('emailTransport', email === undefined ? createEmailTransport(config) : email);
  if (!prisma) app.addHook('onClose', async () => client.$disconnect());

  await app.register(errorsPlugin);
  await app.register(securityPlugin);
  await app.register(openApiPlugin);
  await app.register(authPlugin);

  await app.register(
    async (api) => {
      await api.register(helmet, {
        contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
        crossOriginResourcePolicy: { policy: 'same-site' },
      });
      const typed = api.withTypeProvider<ZodTypeProvider>();
      for (const routes of moduleRoutes) await typed.register(routes);
    },
    { prefix: API_PREFIX },
  );

  return app;
}
