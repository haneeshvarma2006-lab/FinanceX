import { createHash, randomBytes } from 'node:crypto';
import { Google, generateCodeVerifier, generateState } from 'arctic';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getEnv } from '@/lib/env';

/**
 * Google sign-in, built on `arctic` (MIT) rather than hand-rolled, so the
 * OAuth 2.0 / PKCE mechanics come from a reviewed implementation.
 *
 * What this module guarantees:
 *   - PKCE (S256) on every authorization request
 *   - a single-use, hashed `state` value, checked on the way back (CSRF)
 *   - an OIDC `nonce` bound into the ID token, checked on the way back (replay)
 *   - the ID token verified against Google's published JWKS, with issuer and
 *     audience checked — never merely decoded
 *   - a fixed, exact redirect URI derived from APP_URL
 */

export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');

/** Handshake rows live for minutes, not hours. */
export const OAUTH_STATE_TTL_SECONDS = 600;

export function googleRedirectUri(): string {
  // Derived from the validated APP_URL rather than taken from the request, so
  // a spoofed Host header cannot redirect the callback somewhere else. This
  // exact string must be registered in the Google Cloud console.
  return new URL('/api/auth/google/callback', getEnv().APP_URL).toString();
}

export function isGoogleConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export class GoogleNotConfiguredError extends Error {
  constructor() {
    super('Google sign-in is not configured on this deployment');
    this.name = 'GoogleNotConfiguredError';
  }
}

function client(): Google {
  const env = getEnv();
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new GoogleNotConfiguredError();
  }
  return new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, googleRedirectUri());
}

export function hashState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

export type Handshake = {
  url: string;
  state: string;
  stateHash: string;
  codeVerifier: string;
  nonce: string;
};

export function beginGoogleSignIn(): Handshake {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const nonce = randomBytes(16).toString('base64url');

  const url = client().createAuthorizationURL(state, codeVerifier, ['openid', 'profile', 'email']);

  // arctic does not set the OIDC nonce itself, and without it a stolen ID
  // token from another session could be replayed into this one.
  url.searchParams.set('nonce', nonce);
  // Ask Google to pick an account rather than silently reusing the last one.
  url.searchParams.set('prompt', 'select_account');

  return { url: url.toString(), state, stateHash: hashState(state), codeVerifier, nonce };
}

export type GoogleIdentity = {
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
};

export class GoogleAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

const jwks = createRemoteJWKSet(JWKS_URL);

/**
 * Exchange the authorization code and verify the resulting ID token.
 *
 * The verification is the security boundary: signature against Google's JWKS,
 * issuer, audience, expiry, and the nonce we issued. A decoded-but-unverified
 * token is attacker-controlled data.
 */
export async function completeGoogleSignIn(
  code: string,
  codeVerifier: string,
  expectedNonce: string,
): Promise<GoogleIdentity> {
  const env = getEnv();
  const tokens = await client().validateAuthorizationCode(code, codeVerifier);

  const idToken = tokens.idToken();
  if (!idToken) throw new GoogleAuthError('no_id_token', 'Google returned no ID token');

  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: GOOGLE_ISSUERS,
    audience: env.GOOGLE_CLIENT_ID,
  });

  if (payload.nonce !== expectedNonce) {
    throw new GoogleAuthError('nonce_mismatch', 'ID token nonce did not match');
  }

  const subject = typeof payload.sub === 'string' ? payload.sub : null;
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;

  if (!subject) throw new GoogleAuthError('no_subject', 'ID token carried no subject');
  if (!email) throw new GoogleAuthError('no_email', 'ID token carried no email address');

  return {
    subject,
    email,
    // Google's own assertion. Account linking depends on this being true.
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name : null,
    picture: typeof payload.picture === 'string' ? payload.picture : null,
  };
}

/**
 * Only same-origin, path-only redirects are allowed after sign-in.
 *
 * Without this, `?redirectTo=https://evil.example` turns the callback into an
 * open redirect that borrows KyliX's credibility for a phishing page.
 */
export function safeRedirectPath(candidate: string | null | undefined): string {
  const FALLBACK = '/today';
  if (!candidate) return FALLBACK;

  /**
   * Browsers strip tab, newline and carriage return from URLs before resolving
   * them, so "/\t/evil.example" is fetched as "//evil.example" — a
   * scheme-relative URL pointing off-origin. Validating the raw string without
   * removing these first lets that straight through, so they go before any
   * other check rather than after.
   */
  const cleaned = candidate.replace(/[\t\n\r\0]/g, '');

  if (!cleaned.startsWith('/')) return FALLBACK;
  if (cleaned.startsWith('//')) return FALLBACK;
  // Backslash is treated as a path separator by some agents.
  if (cleaned.includes('\\')) return FALLBACK;
  // A scheme hiding behind leading slashes, e.g. "/https://evil.example".
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(cleaned)) return FALLBACK;

  // Resolve against a throwaway origin and confirm it stayed on that origin.
  try {
    const base = 'https://kylix.invalid';
    const resolved = new URL(cleaned, base);
    if (resolved.origin !== base) return FALLBACK;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return FALLBACK;
  }
}
