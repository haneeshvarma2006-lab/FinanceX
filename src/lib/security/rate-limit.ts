import { bumpRateLimit, clearRateLimit } from '@/modules/identity/repository';

export type RateLimitRule = {
  /** Requests permitted inside one window. */
  limit: number;
  windowSeconds: number;
};

/**
 * Two limits guard sign-in, and they defend different things.
 *
 * The per-IP rule slows an attacker spraying many accounts from one host. The
 * per-account rule slows a distributed attack on one specific account, which
 * the IP rule alone cannot see. Neither is sufficient by itself.
 */
export const RULES = {
  signInPerIp: { limit: 20, windowSeconds: 300 },
  signInPerAccount: { limit: 6, windowSeconds: 900 },
  signUpPerIp: { limit: 5, windowSeconds: 3600 },

  /**
   * Fallbacks for when the client IP is unknown — which is the default, because
   * X-Forwarded-For is trusted only when TRUST_PROXY_HEADERS says a proxy
   * rewrites it (see request-context.ts).
   *
   * Without this split, every anonymous caller shares one bucket and the strict
   * per-IP limit becomes a global lockout: five sign-ups an hour across all
   * users, and one script could deny registration to everybody. These ceilings
   * are therefore set to cap runaway abuse rather than to throttle individuals,
   * because an unattributable request cannot be throttled individually.
   *
   * Per-IP limiting is only meaningful once TRUST_PROXY_HEADERS is enabled
   * behind a proxy that overwrites the header.
   */
  signInUnattributed: { limit: 600, windowSeconds: 300 },
  signUpUnattributed: { limit: 120, windowSeconds: 3600 },

  /**
   * Password reset sends an email to an address the requester need not own,
   * so the per-address limit is the one that matters: without it the form is
   * a way to flood someone's inbox. It applies whether or not an account
   * exists, so hitting it reveals nothing.
   */
  resetPerIp: { limit: 10, windowSeconds: 3600 },
  resetPerAddress: { limit: 3, windowSeconds: 3600 },
  resetUnattributed: { limit: 300, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

const NETWORK_RULES = {
  signin: { perIp: RULES.signInPerIp, unattributed: RULES.signInUnattributed },
  signup: { perIp: RULES.signUpPerIp, unattributed: RULES.signUpUnattributed },
  reset: { perIp: RULES.resetPerIp, unattributed: RULES.resetUnattributed },
} as const;

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

/**
 * Pick the key and rule for a network-scoped limit.
 *
 * Callers pass the IP they have; this decides whether it can carry a per-client
 * limit at all, so the choice is made in one place instead of at each call site.
 */
export function networkScope(
  action: keyof typeof NETWORK_RULES,
  ip: string | null,
): { key: string; rule: RateLimitRule } {
  return ip
    ? { key: `${action}:ip:${ip}`, rule: NETWORK_RULES[action].perIp }
    : { key: `${action}:unattributed`, rule: NETWORK_RULES[action].unattributed };
}

export async function consume(
  key: string,
  rule: RateLimitRule,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const count = await bumpRateLimit(key, rule.windowSeconds, now);

  return count > rule.limit
    ? { allowed: false, retryAfterSeconds: rule.windowSeconds }
    : { allowed: true, retryAfterSeconds: 0 };
}

/** Called after a successful sign-in so one bad typo does not count against you. */
export async function reset(key: string): Promise<void> {
  await clearRateLimit(key);
}
