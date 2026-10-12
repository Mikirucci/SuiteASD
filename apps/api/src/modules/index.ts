import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authRoutes } from './auth/routes.js';
import { competitionRoutes } from './competitions/routes.js';
import { deviceRoutes } from './devices/routes.js';
import { documentRoutes } from './documents/routes.js';
import { feeRoutes } from './fees/routes.js';
import { evaluationRoutes } from './evaluations/routes.js';
import { guardianLinkRoutes } from './guardian-links/routes.js';
import { healthRoutes } from './health/routes.js';
import { invitationRoutes } from './invitations/routes.js';
import { kitRoutes } from './kits/routes.js';
import { ledgerRoutes } from './ledger/routes.js';
import { memberRoutes } from './members/routes.js';
import { staffRoutes } from './staff/routes.js';
import { sponsorRoutes } from './sponsors/routes.js';
import { teamRoutes } from './teams/routes.js';
import { tripRoutes } from './trips/routes.js';
import { userRoutes } from './users/routes.js';
import { venueRoutes } from './venues/routes.js';

// Every module registers its routes here (one line per module). All are mounted under /api/v1.
export const moduleRoutes: readonly FastifyPluginAsyncZod[] = [
  healthRoutes,
  authRoutes,
  invitationRoutes,
  userRoutes,
  guardianLinkRoutes,
  deviceRoutes,
  teamRoutes,
  competitionRoutes,
  evaluationRoutes,
  memberRoutes,
  documentRoutes,
  venueRoutes,
  sponsorRoutes,
  tripRoutes,
  kitRoutes,
  staffRoutes,
  ledgerRoutes,
  feeRoutes,
];
