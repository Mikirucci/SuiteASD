import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import scalar from '@scalar/fastify-api-reference';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

export const API_PREFIX = '/api/v1';
export const DOCS_PATH = '/docs';

// Must be registered BEFORE the routes so every route lands in the generated document.
export const openApiPlugin = fp(async (app: FastifyInstance) => {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'SuiteASD API',
        description:
          'REST API of SuiteASD (sports club management). Authenticate with `POST /api/v1/auth/login` and send ' +
          '`Authorization: Bearer <accessToken>`. Errors follow RFC 7807 (`application/problem+json`).',
        version: '1.0.0',
      },
      servers: [{ url: '/' }],
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
    },
    transform: jsonSchemaTransform,
  });

  // The reference UI is served outside the API prefix and loads its viewer script from a CDN,
  // so it gets helmet headers without a Content-Security-Policy.
  await app.register(async (docs) => {
    await docs.register(helmet, { contentSecurityPolicy: false });
    await docs.register(scalar, { routePrefix: DOCS_PATH });
  });
});
