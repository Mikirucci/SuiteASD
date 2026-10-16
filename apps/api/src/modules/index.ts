import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { announcementRoutes } from './announcements/routes.js';
import { attachmentRoutes } from './attachments/routes.js';
import { automationRoutes } from './automations/routes.js';
import { notificationRoutes } from './notifications/routes.js';
import { refereeRoutes } from './referees/routes.js';
import { reportRoutes } from './reports/routes.js';
import { statisticsRoutes } from './statistics/routes.js';
import { attendanceRoutes } from './attendance/routes.js';
import { authRoutes } from './auth/routes.js';
import { competitionRoutes } from './competitions/routes.js';
import { convocationRoutes } from './convocations/routes.js';
import { deviceRoutes } from './devices/routes.js';
import { documentRoutes } from './documents/routes.js';
import { eventRoutes } from './events/routes.js';
import { feeRoutes } from './fees/routes.js';
import { enrolmentRoutes } from './enrolment/routes.js';
import { joinRoutes } from './auth/join-routes.js';
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
  enrolmentRoutes,
  joinRoutes,
  userRoutes,
  guardianLinkRoutes,
  deviceRoutes,
  teamRoutes,
  competitionRoutes,
  evaluationRoutes,
  memberRoutes,
  documentRoutes,
  attachmentRoutes,
  venueRoutes,
  sponsorRoutes,
  tripRoutes,
  kitRoutes,
  staffRoutes,
  ledgerRoutes,
  feeRoutes,
  eventRoutes,
  convocationRoutes,
  attendanceRoutes,
  announcementRoutes,
  automationRoutes,
  notificationRoutes,
  refereeRoutes,
  statisticsRoutes,
  reportRoutes,
];
