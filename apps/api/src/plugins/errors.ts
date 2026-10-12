import { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import {
  AppError,
  PROBLEM_CONTENT_TYPE,
  titleForStatus,
  type FieldError,
  type Problem,
} from '../lib/errors.js';

function sendProblem(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  code: string,
  detail: string,
  errors?: FieldError[],
): FastifyReply {
  const problem: Problem = {
    type: `about:blank#${code}`,
    title: titleForStatus(status),
    status,
    detail,
    instance: request.url,
    code,
    ...(errors ? { errors } : {}),
  };
  return reply.status(status).type(PROBLEM_CONTENT_TYPE).send(problem);
}

function prismaProblem(error: Prisma.PrismaClientKnownRequestError): { status: number; code: string; detail: string } | null {
  switch (error.code) {
    case 'P2002':
      return { status: 409, code: 'conflict', detail: 'A record with the same unique value already exists' };
    case 'P2003':
      return { status: 409, code: 'conflict', detail: 'The operation violates a relation constraint' };
    case 'P2025':
      return { status: 404, code: 'not_found', detail: 'Resource not found' };
    default:
      return null;
  }
}

function statusOf(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode;
  }
  return 500;
}

function clientErrorCode(status: number): string {
  if (status === 415) return 'unsupported_media_type';
  if (status === 429) return 'rate_limited';
  return 'bad_request';
}

export const errorsPlugin = fp(async (app: FastifyInstance) => {
  app.setNotFoundHandler((request, reply) =>
    sendProblem(request, reply, 404, 'not_found', `Route ${request.method} ${request.url} not found`),
  );

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return sendProblem(request, reply, error.status, error.code, error.message, error.errors);
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const errors = error.validation.map((issue: { instancePath: string; message?: string }) => ({
        path: issue.instancePath.replace(/^\//, '').replaceAll('/', '.'),
        message: issue.message ?? 'Invalid value',
      }));
      return sendProblem(request, reply, 422, 'validation_error', 'The request is not valid', errors);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = prismaProblem(error);
      if (mapped) return sendProblem(request, reply, mapped.status, mapped.code, mapped.detail);
    }

    const status = statusOf(error);
    if (status >= 400 && status < 500 && error instanceof Error) {
      // Framework-level client errors (malformed JSON, payload too large, rate limit...): safe to expose the message.
      return sendProblem(request, reply, status, clientErrorCode(status), error.message);
    }

    request.log.error({ err: error }, 'unhandled error');
    return sendProblem(request, reply, 500, 'internal_error', 'An unexpected error occurred');
  });
});
