import { z } from 'zod';

// RFC 7807 problem details, served as application/problem+json.
export const problemSchema = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    detail: z.string().optional(),
    instance: z.string().optional(),
    code: z.string(),
    errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  })
  .meta({ id: 'Problem' });

export type Problem = z.infer<typeof problemSchema>;
export type FieldError = NonNullable<Problem['errors']>[number];

export const PROBLEM_CONTENT_TYPE = 'application/problem+json; charset=utf-8';

const TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Content',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

export function titleForStatus(status: number): string {
  return TITLES[status] ?? 'Error';
}

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly errors?: FieldError[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (code: string, message: string): AppError => new AppError(400, code, message);
export const unauthorized = (message = 'Authentication required'): AppError =>
  new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'You are not allowed to perform this action'): AppError =>
  new AppError(403, 'forbidden', message);
export const notFound = (what = 'Resource'): AppError => new AppError(404, 'not_found', `${what} not found`);
export const conflict = (code: string, message: string): AppError => new AppError(409, code, message);
export const unprocessable = (code: string, message: string, errors?: FieldError[]): AppError =>
  new AppError(422, code, message, errors);

// Documents the standard error responses on a route (OpenAPI). Usage: `response: { 200: ..., ...problemResponses(401, 403) }`
export function problemResponses<const S extends readonly number[]>(
  ...statuses: S
): Record<S[number], typeof problemSchema> {
  const entries = statuses.map((status) => [status, problemSchema] as const);
  return Object.fromEntries(entries) as Record<S[number], typeof problemSchema>;
}
