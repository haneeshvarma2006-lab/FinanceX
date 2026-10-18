import { NextResponse, type NextRequest } from 'next/server';
import { BINANCE_STREAM_ORIGIN } from '@/modules/markets/binance';

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
    // Live markets: crypto prices stream from Binance's public market-data
    // host, straight to the browser. That one host and nothing else.
    `connect-src 'self' ${BINANCE_STREAM_ORIGIN}${isDev ? ' ws: wss:' : ''}`,
    // The on-phone bill reader runs in a worker served from /ocr, which has
    // its own, narrower policy (next.config.ts). Pages may only start workers
    // from this origin.
    `worker-src 'self'`,
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
    'camera=(self), microphone=(), geolocation=(), interest-cohort=()',
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
    // /ocr is the bill reader's engine; it carries its own headers.
    '/((?!_next/static|_next/image|favicon.ico|ocr/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
