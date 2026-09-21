import { authenticated } from '@/lib/api/handler';
import { invalid, ok } from '@/lib/result';
import * as sync from '@/modules/sync/repository';

/**
 * Delta feed for an offline client.
 *
 * Returns every change after `cursor` — creations, updates AND deletions. The
 * deletions are the point: without them a client that was offline during a
 * delete never learns the row is gone and pushes it back.
 *
 * `cursor` is a server-side sequence value, never a timestamp the client
 * supplies. A phone's clock is not trustworthy, and a tie between two rows in
 * the same microsecond would make a client skip or re-fetch.
 */
export const GET = authenticated(async ({ user, request }) => {
  const raw = new URL(request.url).searchParams.get('cursor') ?? '0';

  let cursor: bigint;
  try {
    cursor = BigInt(raw);
    if (cursor < 0n) throw new Error('negative');
  } catch {
    return invalid('cursor', 'Cursor must be a non-negative integer.');
  }

  const [changes, oldest, latest] = await Promise.all([
    sync.changesSince(user.id, cursor),
    sync.oldestCursor(user.id),
    sync.latestCursor(user.id),
  ]);

  /**
   * If the client's cursor predates the retained window, a delta would be
   * silently incomplete. Say so and require a full resync rather than handing
   * back a partial answer the client would treat as authoritative.
   */
  const stale = cursor > 0n && oldest > 0n && cursor < oldest - 1n;

  return ok({
    changes: stale ? [] : changes,
    cursor: changes.length > 0 ? changes[changes.length - 1]!.id.toString() : raw,
    latestCursor: latest.toString(),
    hasMore: changes.length > 0 && changes[changes.length - 1]!.id < latest,
    resyncRequired: stale,
  });
});
