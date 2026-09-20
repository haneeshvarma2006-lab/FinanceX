import { cookies } from 'next/headers';
import { getEnv } from '@/lib/env';

/**
 * The __Host- prefix is enforced by the browser: the cookie must be Secure,
 * Path=/, and carry no Domain attribute. That makes it impossible for a
 * subdomain to overwrite the session cookie, which is the usual way cookie
 * fixation is pulled off.
 *
 * It requires HTTPS, so plain-HTTP local development uses the unprefixed name.
 */
export function sessionCookieName(): string {
  return getEnv().APP_URL.startsWith('https://') ? '__Host-kylix_session' : 'kylix_session';
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const secure = getEnv().APP_URL.startsWith('https://');

  (await cookies()).set(sessionCookieName(), token, {
    httpOnly: true, // unreadable from JavaScript, so XSS cannot exfiltrate it
    secure,
    sameSite: 'lax', // blocks cross-site POST while keeping normal inbound links working
    path: '/',
    expires: expiresAt,
  });
}

export async function readSessionCookie(): Promise<string | undefined> {
  return (await cookies()).get(sessionCookieName())?.value;
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(sessionCookieName());
}

/**
 * Short-lived cookies that bind an OAuth handshake to the browser that started
 * it.
 *
 * The server-side `state` row alone gives single-use replay protection but NOT
 * CSRF protection: any browser presenting a live state value would be accepted,
 * so an attacker could start a flow, capture their own `code` and `state`, and
 * then have a victim's browser complete it — planting the attacker's session in
 * the victim's browser. Requiring a matching cookie is what actually ties the
 * callback to the browser that began the flow.
 */
const OAUTH_STATE_COOKIE = 'kylix_oauth_state';
const PENDING_REGISTRATION_COOKIE = 'kylix_pending_registration';

function handshakeCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: getEnv().APP_URL.startsWith('https://'),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export async function setOAuthStateCookie(state: string, maxAgeSeconds: number): Promise<void> {
  (await cookies()).set(OAUTH_STATE_COOKIE, state, handshakeCookieOptions(maxAgeSeconds));
}

export async function readOAuthStateCookie(): Promise<string | undefined> {
  return (await cookies()).get(OAUTH_STATE_COOKIE)?.value;
}

export async function clearOAuthStateCookie(): Promise<void> {
  (await cookies()).delete(OAUTH_STATE_COOKIE);
}

export async function setPendingRegistrationCookie(
  token: string,
  maxAgeSeconds: number,
): Promise<void> {
  (await cookies()).set(PENDING_REGISTRATION_COOKIE, token, handshakeCookieOptions(maxAgeSeconds));
}

export async function readPendingRegistrationCookie(): Promise<string | undefined> {
  return (await cookies()).get(PENDING_REGISTRATION_COOKIE)?.value;
}

export async function clearPendingRegistrationCookie(): Promise<void> {
  (await cookies()).delete(PENDING_REGISTRATION_COOKIE);
}
