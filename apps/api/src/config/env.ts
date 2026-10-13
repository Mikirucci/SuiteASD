import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(30).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
  INVITATION_TTL_DAYS: z.coerce.number().int().min(1).default(7),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(900),
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(1024).default(19456),
  TRUST_PROXY: booleanString.default(false),
  SCHEDULER_ENABLED: booleanString.default(true),
  // Directory for uploaded documents (relative paths resolve against the process cwd). Git-ignored.
  STORAGE_DIR: z.string().min(1).default('storage'),
  // Email channel (SPEC 07): emails are sent only when RESEND_API_KEY is set; otherwise they are logged as SKIPPED.
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).optional(),
});

export type AppConfig = z.infer<typeof envSchema>;

const DEV_SECRET_PREFIX = 'dev-only-';

export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  if (parsed.data.RESEND_API_KEY && !parsed.data.EMAIL_FROM) {
    throw new Error('Invalid environment configuration: EMAIL_FROM is required when RESEND_API_KEY is set');
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_SECRET.startsWith(DEV_SECRET_PREFIX)) {
    throw new Error('Invalid environment configuration: JWT_SECRET must not be the development default');
  }
  return parsed.data;
}
