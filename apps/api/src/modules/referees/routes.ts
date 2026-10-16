import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { registerCrudRoutes } from '../../lib/crud-routes.js';
import {
  assignmentSchema,
  createAssignmentBodySchema,
  createRefereeBodySchema,
  listAssignmentsQuerySchema,
  listRefereesQuerySchema,
  refereeSchema,
  updateAssignmentBodySchema,
  updateRefereeBodySchema,
} from './schema.js';
import { assignmentService, refereeService } from './service.js';

export const refereeRoutes: FastifyPluginAsyncZod = async (app) => {
  registerCrudRoutes(app, {
    path: '/referees',
    tag: 'Referees',
    noun: 'referee',
    permissions: { read: 'referees:read', write: 'referees:write' },
    attachmentType: 'REFEREE',
    schemas: {
      dto: refereeSchema,
      createBody: createRefereeBodySchema,
      updateBody: updateRefereeBodySchema,
      listQuery: listRefereesQuerySchema,
    },
    service: refereeService,
  });

  // Designations: filter by `matchId` for the referees of a match, by `refereeId` for a referee's history.
  registerCrudRoutes(app, {
    path: '/referee-assignments',
    tag: 'Referees',
    noun: 'referee designation',
    permissions: { read: 'referees:read', write: 'referees:write' },
    schemas: {
      dto: assignmentSchema,
      createBody: createAssignmentBodySchema,
      updateBody: updateAssignmentBodySchema,
      listQuery: listAssignmentsQuerySchema,
    },
    service: assignmentService,
  });
};
