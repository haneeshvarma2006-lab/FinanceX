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
