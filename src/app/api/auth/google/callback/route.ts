import { randomBytes } from 'node:crypto';
import { addMinutes } from 'date-fns';
import { NextResponse, type NextRequest } from 'next/server';
import {
  clearOAuthStateCookie,
  readOAuthStateCookie,
  setPendingRegistrationCookie,
  setSessionCookie,
} from '@/lib/auth/cookies';
import { getRequestContext } from '@/lib/auth/request-context';
import { hashToken } from '@/lib/security/tokens';
import { safeEquals } from '@/lib/security/tokens';
import {
  completeGoogleSignIn,
  GoogleAuthError,
  hashState,
  isGoogleConfigured,
  safeRedirectPath,
} from '@/modules/identity/oauth';
import { resolveGoogleIdentity } from '@/modules/identity/linking';
import * as repo from '@/modules/identity/repository';
import { startSessionForUser } from '@/modules/identity/service';

/** How long a verified-but-not-yet-registered identity is held. */
const PENDING_REGISTRATION_TTL_MINUTES = 15;

async function fail(request: NextRequest, reason: string): Promise<NextResponse> {
  await clearOAuthStateCookie();
  // Reasons are a fixed vocabulary rendered by the sign-in page. Nothing from
  // the provider or the query string is reflected back into the response.
  return NextResponse.redirect(new URL(`/sign-in?error=${reason}`, request.url));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isGoogleConfigured()) return fail(request, 'google_unavailable');

  const params = request.nextUrl.searchParams;
  const ctx = await getRequestContext();

  // Google reports a user-cancelled consent screen this way.
  if (params.get('error')) return fail(request, 'google_cancelled');

  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) return fail(request, 'google_invalid');

  /**
   * CSRF gate. The state must match the cookie set when this browser started
   * the flow. Without this the server-side row would accept a state value from
   * any browser, letting an attacker complete their own flow in a victim's
   * browser and plant the attacker's session there.
   */
  const cookieState = await readOAuthStateCookie();
  if (!cookieState || !safeEquals(cookieState, state)) {
    await repo.insertAuditEntry({
      action: 'auth.google.state_mismatch',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return fail(request, 'google_invalid');
  }

  // Single-use: the row is deleted as it is read, so a replayed callback finds
  // nothing and the same code cannot be exchanged twice.
  const handshake = await repo.consumeOAuthState(hashState(state), new Date());
  if (!handshake) return fail(request, 'google_expired');

  let identity;
  try {
    identity = await completeGoogleSignIn(code, handshake.codeVerifier, handshake.nonce);
  } catch (error) {
    await repo.insertAuditEntry({
      action: 'auth.google.failed',
      metadata: { code: error instanceof GoogleAuthError ? error.code : 'exchange_failed' },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return fail(request, 'google_invalid');
  }

  const linkingTo = handshake.linkToUserId
    ? await repo.findUserById(handshake.linkToUserId)
    : undefined;

  const outcome = await resolveGoogleIdentity(identity, linkingTo);

  if (outcome.kind === 'refused') {
    await repo.insertAuditEntry({
      userId: linkingTo?.id ?? null,
      action: 'auth.google.refused',
      metadata: { reason: outcome.reason },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return fail(request, `google_${outcome.reason}`);
  }

  if (outcome.kind === 'needs_registration') {
    /**
     * A new person still has to pass the age gate and give consent, so no
     * account is created here. The verified identity is parked in its own
     * table under a random token held in an httpOnly cookie — never in the
     * query string, where the email or subject could simply be edited.
     */
    const token = randomBytes(32).toString('base64url');

    await repo.insertPendingRegistration({
      tokenHash: hashToken(token),
      provider: 'google',
      subject: identity.subject,
      email: identity.email,
      displayName: identity.name,
      avatarUrl: identity.picture,
      redirectTo: handshake.redirectTo,
      expiresAt: addMinutes(new Date(), PENDING_REGISTRATION_TTL_MINUTES),
    });

    await setPendingRegistrationCookie(token, PENDING_REGISTRATION_TTL_MINUTES * 60);
    await clearOAuthStateCookie();

    return NextResponse.redirect(new URL('/complete-signup', request.url));
  }

  // Already linked, or just linked: issue a session.
  const session = await startSessionForUser(outcome.user, ctx);
  await setSessionCookie(session.token, session.expiresAt);
  await clearOAuthStateCookie();

  await repo.insertAuditEntry({
    userId: outcome.user.id,
    action: outcome.kind === 'linked_to_local' ? 'auth.google.linked' : 'auth.google.signin',
    entityType: 'user',
    entityId: outcome.user.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  return NextResponse.redirect(new URL(safeRedirectPath(handshake.redirectTo), request.url));
}
