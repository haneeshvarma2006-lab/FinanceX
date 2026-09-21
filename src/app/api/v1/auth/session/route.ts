import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/request-context';
import { bearerTokenFrom } from '@/lib/auth/bearer';
import { errorResponse, jsonResponse, readBody } from '@/lib/api/handler';
import * as identity from '@/modules/identity/service';
import { signInSchema } from '@/modules/identity/validators';

/**
 * Session exchange for native clients.
 *
 * Returns the same opaque session token the web cookie carries, for the client
 * to store in the Keychain or Keystore and present as a Bearer token. No new
 * credential type is minted — the token is a row in `sessions`, revocable from
 * the web session list like any other.
 */

const bodySchema = signInSchema.extend({
  /** Shown in Settings → Security so one device can be revoked, not all. */
  deviceName: z.string().trim().max(120).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const body = await readBody(request, bodySchema);
  if (!body.ok) return errorResponse(body.error);

  const ctx = await getRequestContext();

  const result = await identity.signIn(
    { email: body.value.email, password: body.value.password },
    {
      ...ctx,
      client: 'mobile',
      // The device name replaces the user agent, which is uninformative from
      // a native client.
      userAgent: body.value.deviceName ?? ctx.userAgent,
    },
  );

  if (!result.ok) {
    switch (result.error.kind) {
      case 'rate_limited':
        return errorResponse({
          kind: 'rate_limited',
          message: 'Too many attempts. Please wait a few minutes and try again.',
          retryAfterSeconds: result.error.retryAfterSeconds,
        });
      case 'age_restricted':
        return errorResponse({ kind: 'forbidden', message: result.error.message });
      default:
        // One message for unknown-address and wrong-password alike, matching
        // the web exactly — a separate API must not become an enumeration
        // oracle the web form is not.
        return errorResponse({
          kind: 'forbidden',
          message: 'That email and password do not match.',
        });
    }
  }

  return jsonResponse(
    {
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.displayName,
        timezone: result.user.timezone,
        baseCurrency: result.user.baseCurrency,
      },
    },
    201,
  );
}

/** Sign out: destroys the session server-side, as the web does. */
export async function DELETE(request: Request): Promise<NextResponse> {
  const token = bearerTokenFrom(request.headers);
  if (!token) {
    return errorResponse({ kind: 'forbidden', message: 'Sign in to continue.' });
  }

  await identity.signOut(token, await getRequestContext());
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
