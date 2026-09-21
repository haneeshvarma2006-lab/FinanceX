import { resolveSession } from '@/modules/identity/service';
import type { User } from '@/modules/identity/schema';
import { readSessionCookie } from './cookies';

/**
 * Authenticate a request from either a browser or a native client.
 *
 * The session *store* is shared: the same opaque token, the same SHA-256 at
 * rest, the same absolute and idle deadlines. Only the presentation differs —
 * a browser sends a `__Host-` cookie, a native client an Authorization header,
 * because it has no cookie jar worth relying on and no same-site concept.
 *
 * Presenting the token two ways does not make it two kinds of credential. A
 * mobile session appears in the web session list and is revocable from there,
 * and vice versa.
 */

const BEARER = /^Bearer (.+)$/i;

export function bearerTokenFrom(headers: Headers): string | undefined {
  const match = BEARER.exec(headers.get('authorization') ?? '');
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : undefined;
}

export type AuthenticatedRequest = { user: User; via: 'bearer' | 'cookie' };

/**
 * Resolve the caller, preferring the Authorization header.
 *
 * The header wins when both are present: a native client that sent one is
 * making an explicit claim, whereas a stray cookie could be ambient. Checking
 * the explicit credential first also means a request cannot be silently
 * attributed to a different session than the one it intended to use.
 */
export async function authenticateRequest(
  request: Request,
): Promise<AuthenticatedRequest | undefined> {
  const bearer = bearerTokenFrom(request.headers);

  if (bearer) {
    const user = await resolveSession(bearer);
    return user ? { user, via: 'bearer' } : undefined;
  }

  const cookie = await readSessionCookie();
  if (!cookie) return undefined;

  const user = await resolveSession(cookie);
  return user ? { user, via: 'cookie' } : undefined;
}
