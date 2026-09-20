import { z } from 'zod';

/**
 * Environment contract. The process refuses to start when it is not satisfied,
 * which is deliberately louder than discovering a missing secret at the moment
 * a user tries to sign in.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /**
   * z.string().url() alone is too permissive here: it accepts "localhost:5432",
   * reading "localhost" as the scheme. That would pass boot validation and then
   * fail at connection time with a far less obvious error, so the scheme is
   * checked explicitly.
   */
  DATABASE_URL: z.string().refine(
    (value) => {
      try {
        const { protocol, hostname } = new URL(value);
        return (protocol === 'postgres:' || protocol === 'postgresql:') && hostname !== '';
      } catch {
        return false;
      }
    },
    { message: 'DATABASE_URL must be a postgres:// or postgresql:// connection string' },
  ),

  /**
   * Used to derive secondary keys. Must be at least 32 bytes of real entropy.
   * Generate with: openssl rand -base64 48
   */
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),

  /** Absolute origin, used for cookie and redirect safety checks. */
  APP_URL: z
    .string()
    .refine(
      (value) => {
        try {
          const { protocol } = new URL(value);
          return protocol === 'http:' || protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'APP_URL must be an http:// or https:// origin' },
    )
    .default('http://localhost:3000'),

  /** Sessions expire absolutely at this age, regardless of activity. */
  SESSION_ABSOLUTE_DAYS: z.coerce.number().int().positive().default(30),
  /** Sessions expire this long after the last request. */
  SESSION_IDLE_HOURS: z.coerce.number().int().positive().default(72),

  /**
   * Google OAuth/OIDC. Optional: without a client id and secret the Google
   * button is not rendered and the routes refuse rather than half-working.
   * These are credentials — they come from a Google Cloud project the operator
   * creates, and there is no default that could possibly be correct.
   */
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  /**
   * Email transport. "console" writes the message to the server log and sends
   * nothing, which is the honest default when no provider is configured.
   */
  EMAIL_TRANSPORT: z.enum(['console', 'none']).default('console'),
  EMAIL_FROM: z.string().default('KyliX <no-reply@localhost>'),

  /**
   * Only enable behind a proxy that overwrites X-Forwarded-For. With no such
   * proxy, a caller can set the header themselves and walk past per-IP limits.
   */
  TRUST_PROXY_HEADERS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration.\n${issues}\n\n` +
        `Copy .env.example to .env and fill in the values.`,
    );
  }

  cached = parsed.data;
  return cached;
}

/** Test-only: forget the memoised value so a test can vary the environment. */
export function resetEnvCache(): void {
  cached = undefined;
}
