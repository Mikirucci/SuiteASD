import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

// CORS allow-list from configuration + global rate limit (in-memory: one instance, see docs/DECISIONS.md).
export const securityPlugin = fp(async (app: FastifyInstance) => {
  await app.register(cors, {
    origin: app.config.CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'If-None-Match'],
    exposedHeaders: ['ETag', 'Content-Disposition', 'Idempotent-Replayed', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
    maxAge: 600,
  });

  await app.register(rateLimit, {
    global: true,
    max: app.config.RATE_LIMIT_MAX,
    timeWindow: app.config.RATE_LIMIT_WINDOW_SECONDS * 1000,
  });
});

// Strict per-route limit for credential endpoints (login, register, refresh, invitation accept).
export function authRateLimit(app: FastifyInstance): { rateLimit: { max: number; timeWindow: number } } {
  return {
    rateLimit: {
      max: app.config.AUTH_RATE_LIMIT_MAX,
      timeWindow: app.config.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000,
    },
  };
}
