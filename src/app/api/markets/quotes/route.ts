import { getCurrentUser } from '@/lib/auth/current-user';
import { getEnv } from '@/lib/env';
import { consume, RULES } from '@/lib/security/rate-limit';
import { isInstrumentId, MAX_KEYED } from '@/modules/markets/catalog';
import { keyedQuote } from '@/modules/markets/twelvedata';

/**
 * Keyed market quotes — spot gold, forex, shares — for the signed-in user.
 *
 * The browser sends instrument ids; this asks the provider with the server's
 * key, through a cache shared by every viewer for the poll interval. Without
 * a key it answers `configured: false` rather than inventing a number.
 */
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 });

  const env = getEnv();
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!env.TWELVE_DATA_API_KEY) {
    return Response.json({ configured: false }, { headers });
  }

  const limit = await consume(`markets:${user.id}`, RULES.marketQuotesPerHour);
  if (!limit.allowed) {
    return Response.json(
      { error: 'Too many requests' },
      { status: 429, headers: { ...headers, 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const ids = [
    ...new Set(
      (new URL(request.url).searchParams.get('ids') ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.startsWith('td:') && isInstrumentId(id)),
    ),
  ].slice(0, MAX_KEYED);

  const now = Date.now();
  const ttl = env.MARKET_POLL_SECONDS * 1000;
  const entries = await Promise.all(
    ids.map(async (id) => [id, await keyedQuote(id, env.TWELVE_DATA_API_KEY!, ttl, now)] as const),
  );

  return Response.json(
    {
      configured: true,
      intervalSeconds: env.MARKET_POLL_SECONDS,
      quotes: Object.fromEntries(entries),
    },
    { headers },
  );
}
