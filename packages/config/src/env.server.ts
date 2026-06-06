import { z } from 'zod';

const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

function emptyToUndefined(value: unknown): unknown {
  return value === '' ? undefined : value;
}

const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    DATABASE_URL: z.string().min(1),

    AUTH_SECRET: z.string().min(32),
    AUTH_URL: optionalUrl,
    NEXTAUTH_URL: optionalUrl,

    R2_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_RECORDINGS_BUCKET_NAME: z.string().min(1),
    // Recordings bucket public base (its own r2.dev / custom domain; objects served at root).
    R2_PUBLIC_URL: optionalUrl,
    // Separate public bucket for product/variant images (same R2 account/credentials).
    R2_PRODUCTS_BUCKET_NAME: z.preprocess(emptyToUndefined, z.string().optional()),
    R2_PRODUCTS_PUBLIC_URL: optionalUrl,

    REDIS_URL: optionalUrl,

    SHOPEE_PARTNER_ID: z.preprocess(emptyToUndefined, z.string().optional()),
    SHOPEE_PARTNER_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
    TOKOPEDIA_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().optional()),
    TOKOPEDIA_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),

    MARKETPLACE_ENCRYPTION_SECRET: z.string().min(32),

    LOG_LEVEL: logLevelSchema.optional(),
    LOG_PRETTY: z.enum(['true', 'false']).optional(),

    SENTRY_DSN: optionalUrl,
    SENTRY_ENVIRONMENT: z.preprocess(emptyToUndefined, z.string().optional()),
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).optional(),

    APP_VERSION: z.preprocess(emptyToUndefined, z.string().optional()),
    WORKER_HEALTH_PORT: z.coerce.number().int().positive().optional(),
    WORKER_HEALTH_URL: optionalUrl,
    WORKER_ENABLE_SCHEDULERS: z.enum(['true', 'false']).optional(),

    ADMIN_API_TOKEN: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.REDIS_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'REDIS_URL is required in production for rate limiting, metrics, and BullMQ.',
        path: ['REDIS_URL'],
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid server environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Invalid server environment variables');
  }

  cached = parsed.data;
  return cached;
}

/** Fail fast during process boot (web instrumentation / worker bootstrap). */
export function validateServerEnvOnStartup(): ServerEnv {
  return getServerEnv();
}

/** Validated server environment. Access at runtime only. */
export const serverEnv = new Proxy({} as ServerEnv, {
  get(_target, prop: string) {
    return getServerEnv()[prop as keyof ServerEnv];
  },
});

export { logLevelSchema };
