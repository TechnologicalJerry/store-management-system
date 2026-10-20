import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file into process.env if present
dotenv.config();

/**
 * Helper to parse boolean values from environment variables cleanly.
 */
const booleanFromEnv = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .transform((val): boolean => {
      if (typeof val === 'boolean') {
        return val;
      }
      const normalized = val.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') {
        return true;
      }
      if (normalized === 'false' || normalized === '0') {
        return false;
      }
      throw new Error(`Invalid boolean string: "${val}"`);
    })
    .default(defaultValue);

const DEV_JWT_SECRET = 'dev-jwt-access-secret-minimum-32-chars-long!!';
const DEV_COOKIE_SECRET = 'dev-cookie-secret-minimum-32-chars-long!!';

/**
 * Zod schema defining the environment configuration contract.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z
      .string()
      .min(1, 'HOST must not be empty')
      .default('0.0.0.0'),
    PORT: z
      .preprocess(
        val => (typeof val === 'string' ? parseInt(val, 10) : val),
        z
          .number({
            invalid_type_error: 'PORT must be a valid number',
          })
          .int('PORT must be an integer')
          .min(1, 'PORT must be at least 1')
          .max(65535, 'PORT must be at most 65535')
      )
      .default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'], {
        errorMap: () => ({
          message:
            'LOG_LEVEL must be one of: fatal, error, warn, info, debug, trace, silent',
        }),
      })
      .default('info'),
    API_PREFIX: z
      .string()
      .regex(/^\/[a-zA-Z0-9_\-/]*$/, 'API_PREFIX must start with / and be a valid URL path')
      .default('/api/v1'),
    CORS_ORIGINS: z
      .preprocess(val => {
        if (typeof val === 'string') {
          return val
            .split(',')
            .map(origin => origin.trim())
            .filter(Boolean);
        }
        if (Array.isArray(val)) {
          return val;
        }
        return val;
      }, z.array(z.string().min(1, 'CORS origin item cannot be empty')).min(1, 'At least one CORS origin must be configured'))
      .default(['http://localhost:3000', 'http://localhost:5173']),
    SWAGGER_ENABLED: z.preprocess(val => {
      if (val === undefined || val === '') {
        // Default based on NODE_ENV if available
        return process.env['NODE_ENV'] !== 'production';
      }
      return val;
    }, booleanFromEnv(true)),

    // =========================================================================
    // Stage 2: PostgreSQL Database & Prisma Configuration
    // =========================================================================
    DATABASE_URL: z
      .string()
      .regex(
        /^postgres(ql)?:\/\/.+/,
        'DATABASE_URL must be a valid PostgreSQL connection URL starting with postgresql:// or postgres://'
      )
      .default('postgresql://postgres:postgres@localhost:5432/store_management?schema=public'),
    DATABASE_DIRECT_URL: z
      .string()
      .regex(
        /^postgres(ql)?:\/\/.+/,
        'DATABASE_DIRECT_URL must be a valid PostgreSQL connection URL'
      )
      .optional(),
    DB_POOL_MAX: z
      .preprocess(
        val => (typeof val === 'string' ? parseInt(val, 10) : val),
        z
          .number({ invalid_type_error: 'DB_POOL_MAX must be a valid number' })
          .int('DB_POOL_MAX must be an integer')
          .min(1, 'DB_POOL_MAX must be at least 1')
          .max(100, 'DB_POOL_MAX cannot exceed 100')
      )
      .default(10),
    DB_CONNECTION_TIMEOUT_MS: z
      .preprocess(
        val => (typeof val === 'string' ? parseInt(val, 10) : val),
        z
          .number({ invalid_type_error: 'DB_CONNECTION_TIMEOUT_MS must be a valid number' })
          .int('DB_CONNECTION_TIMEOUT_MS must be an integer')
          .min(500, 'DB_CONNECTION_TIMEOUT_MS must be at least 500ms')
          .max(60000, 'DB_CONNECTION_TIMEOUT_MS cannot exceed 60000ms')
      )
      .default(5000),

    // =========================================================================
    // Stage 3: Authentication, JWT & Session Security Configuration
    // =========================================================================
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters long for cryptographic security')
      .default(DEV_JWT_SECRET),
    JWT_ACCESS_TTL: z
      .string()
      .regex(/^[0-9]+[smhd]$/, 'JWT_ACCESS_TTL must be a valid time span (e.g. 15m, 1h)')
      .default('15m'),
    JWT_ISSUER: z.string().min(1).default('store-management-system'),
    JWT_AUDIENCE: z.string().min(1).default('store-management-system-api'),
    REFRESH_TOKEN_TTL_DAYS: z
      .preprocess(
        val => (typeof val === 'string' ? parseInt(val, 10) : val),
        z
          .number({ invalid_type_error: 'REFRESH_TOKEN_TTL_DAYS must be a number' })
          .int()
          .min(1, 'REFRESH_TOKEN_TTL_DAYS must be at least 1 day')
          .max(90, 'REFRESH_TOKEN_TTL_DAYS cannot exceed 90 days')
      )
      .default(7),
    MAX_ACTIVE_SESSIONS: z
      .preprocess(
        val => (typeof val === 'string' ? parseInt(val, 10) : val),
        z
          .number({ invalid_type_error: 'MAX_ACTIVE_SESSIONS must be a number' })
          .int()
          .min(1, 'MAX_ACTIVE_SESSIONS must be at least 1')
          .max(10, 'MAX_ACTIVE_SESSIONS cannot exceed 10')
      )
      .default(2),
    AUTH_COOKIE_NAME: z.string().min(1).default('refresh_token'),
    COOKIE_SECRET: z
      .string()
      .min(32, 'COOKIE_SECRET must be at least 32 characters long for cryptographic security')
      .default(DEV_COOKIE_SECRET),
  })
  .superRefine((data, ctx) => {
    // In production, enforce that CORS_ORIGINS does not include a wildcard '*'
    if (data.NODE_ENV === 'production') {
      if (data.CORS_ORIGINS.includes('*')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Wildcard CORS origin (*) is not allowed in production environment. Specify explicit origins.',
          path: ['CORS_ORIGINS'],
        });
      }

      if (data.JWT_ACCESS_SECRET === DEV_JWT_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'JWT_ACCESS_SECRET must be set to a secure, unique secret in production environment.',
          path: ['JWT_ACCESS_SECRET'],
        });
      }

      if (data.COOKIE_SECRET === DEV_COOKIE_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'COOKIE_SECRET must be set to a secure, unique secret in production environment.',
          path: ['COOKIE_SECRET'],
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validates and returns the parsed environment configuration.
 * Throws a formatted, actionable error if validation fails without leaking secrets.
 */
export function loadEnv(rawEnv: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const formattedErrors = result.error.issues
      .map(issue => `  - [${issue.path.join('.') || 'root'}]: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Invalid environment configuration:\n${formattedErrors}\n\nPlease check your .env file or environment variables.`
    );
  }

  return result.data;
}

/**
 * Cached singleton instance of the validated environment.
 */
let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = loadEnv();
  }
  return cachedEnv;
}

/**
 * Resets the cached environment (used in isolated unit tests).
 */
export function resetEnvCache(): void {
  cachedEnv = null;
}
