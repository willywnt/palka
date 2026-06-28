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
    // Shopee Open Platform REST host — sandbox `https://partner.test-stable.shopeemobile.com`
    // vs live `https://partner.shopeemobile.com`. Switching environments is an env change only.
    SHOPEE_API_BASE_URL: optionalUrl,
    // OAuth redirect/callback URL registered in the Shopee app (must match exactly).
    SHOPEE_OAUTH_REDIRECT_URI: optionalUrl,
    // TikTok Shop Open API (Tokopedia channel) app credentials + onboarding config.
    TOKOPEDIA_APP_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
    TOKOPEDIA_APP_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
    // service_id used to build the seller authorization URL.
    TOKOPEDIA_SERVICE_ID: z.preprocess(emptyToUndefined, z.string().optional()),
    // TikTok Shop REST host (sandbox vs live) — switching environments is an env change only.
    TOKOPEDIA_API_BASE_URL: optionalUrl,
    // OAuth redirect/callback URL registered in the TikTok Shop app (must match exactly).
    TOKOPEDIA_OAUTH_REDIRECT_URI: optionalUrl,
    LAZADA_APP_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
    LAZADA_APP_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
    LAZADA_API_BASE_URL: optionalUrl,
    // OAuth redirect/callback URL registered in the Lazada app (must match exactly).
    LAZADA_OAUTH_REDIRECT_URI: optionalUrl,

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
    // Custom-server (VPS/dev) scheduled order-pull interval in ms; 0/unset = off (the default,
    // the custom server runs on the VPS host). e.g. 300000 = every 5 min.
    ORDERS_AUTO_PULL_INTERVAL_MS: z.coerce.number().int().nonnegative().optional(),
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
