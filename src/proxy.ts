import { NextResponse, type NextRequest } from 'next/server';

/**
 * Security headers, applied to every response.
 *
 * This is Next 16's `proxy` convention, which replaced `middleware`.
 *
 * The CSP is nonce-based rather than allow-listed: a fresh nonce per request
 * means an injected <script> tag cannot execute even if it lands in the
 * document, because it cannot know the nonce.
 */
export default function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV !== 'production';

  const csp = [
    `default-src 'self'`,
    // 'strict-dynamic' lets Next's nonce-bearing bootstrap load its own chunks
    // without widening the policy to every script on the origin.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Next injects critical CSS as a style element; styles carry no script
    // capability, so this is a much smaller concession than script-src would be.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  );

  // HSTS is meaningless over plain HTTP and would be wrong to send in local dev.
  if (!isDev) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, which need no dynamic headers.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
