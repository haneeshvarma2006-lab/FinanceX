import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256 bits of entropy, base64url so it is cookie-safe without escaping. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Sessions are looked up by hash, never by the raw token, so the database
 * never holds a credential that would work if read.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison, for anywhere a secret is compared directly. */
export function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
