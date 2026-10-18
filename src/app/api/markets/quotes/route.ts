import { getCurrentUser } from '@/lib/auth/current-user';
import { consume, RULES } from '@/lib/security/rate-limit';
import { isInstrumentId, MAX_KEYED } from '@/modules/markets/catalog';
import { keyedQuotes, marketProvider } from '@/modules/markets/service';

/**
 * Keyed market quotes — spot gold, forex, shares — for the signed-in user.
 *
 * The browser sends instrument ids; the markets service answers from the
 * shared cache, asking the provider with the server's key only when a price
 * is due and the allowance has room. Without a key it answers
 * `configured: false` rather than inventing a number.
 */
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Not signed in' }, { status: 401 });

  const provider = marketProvider();
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!provider) {
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

  const quotes = await keyedQuotes(ids, provider);

  return Response.json(
    {
      configured: true,
      provider: provider.label,
      intervalSeconds: provider.refreshSeconds,
      quotes,
    },
    { headers },
  );
}
