import { addSeconds } from 'date-fns';
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/current-user';
import { setOAuthStateCookie } from '@/lib/auth/cookies';
import {
  beginGoogleSignIn,
  isGoogleConfigured,
  OAUTH_STATE_TTL_SECONDS,
  safeRedirectPath,
} from '@/modules/identity/oauth';
import * as repo from '@/modules/identity/repository';

/**
 * Start the Google sign-in handshake.
 *
 * The PKCE verifier and OIDC nonce are stored server-side and never leave the
 * server. The `state` is stored server-side AND set as an httpOnly cookie, so
 * the callback can require that the browser completing the flow is the one
 * that began it — the server-side row alone would accept any browser holding a
 * live state value.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isGoogleConfigured()) {
    // Honest failure: no credentials are configured for this deployment, and
    // pretending otherwise would send the user to a broken Google page.
    return NextResponse.redirect(new URL('/sign-in?error=google_unavailable', request.url));
  }

  const redirectTo = safeRedirectPath(request.nextUrl.searchParams.get('redirectTo'));
  const linkMode = request.nextUrl.searchParams.get('mode') === 'link';

  // Linking requires an existing session; signing in must not have one.
  const currentUser = linkMode ? await getCurrentUser() : undefined;
  if (linkMode && !currentUser) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  const handshake = beginGoogleSignIn();

  await repo.insertOAuthState({
    stateHash: handshake.stateHash,
    codeVerifier: handshake.codeVerifier,
    nonce: handshake.nonce,
    redirectTo,
    linkToUserId: currentUser?.id ?? null,
    expiresAt: addSeconds(new Date(), OAUTH_STATE_TTL_SECONDS),
  });

  await setOAuthStateCookie(handshake.state, OAUTH_STATE_TTL_SECONDS);

  return NextResponse.redirect(handshake.url);
}
