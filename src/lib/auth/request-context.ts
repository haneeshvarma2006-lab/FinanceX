import { headers } from 'next/headers';
import { getEnv } from '@/lib/env';
import type { RequestContext } from '@/modules/identity/service';

/**
 * Trusting X-Forwarded-For blindly lets a caller spoof their IP and walk
 * straight past a per-IP rate limit. Only the left-most entry is taken, and
 * only when the deployment is known to sit behind a proxy that rewrites it.
 *
 * TRUST_PROXY_HEADERS must therefore stay off unless such a proxy is actually
 * in front of the app.
 */
export async function getRequestContext(): Promise<RequestContext> {
  const h = await headers();

  const userAgent = h.get('user-agent')?.slice(0, 512) ?? null;

  if (!getEnv().TRUST_PROXY_HEADERS) {
    return { ip: null, userAgent };
  }

  const forwarded = h.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? h.get('x-real-ip')?.trim() ?? null;

  return { ip: ip && ip.length <= 45 ? ip : null, userAgent };
}
