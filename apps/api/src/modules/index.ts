import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authRoutes } from './auth/routes.js';
import { deviceRoutes } from './devices/routes.js';
import { guardianLinkRoutes } from './guardian-links/routes.js';
import { healthRoutes } from './health/routes.js';
import { invitationRoutes } from './invitations/routes.js';
import { teamRoutes } from './teams/routes.js';
import { userRoutes } from './users/routes.js';

// Every module registers its routes here (one line per module). All are mounted under /api/v1.
export const moduleRoutes: readonly FastifyPluginAsyncZod[] = [
  healthRoutes,
  authRoutes,
  invitationRoutes,
  userRoutes,
  guardianLinkRoutes,
  deviceRoutes,
  teamRoutes,
];
