import { getCurrentUser } from '@/lib/auth/current-user';
import { billStore } from '@/lib/storage/bills';
import * as repo from '@/modules/finance/repository';

/**
 * A bill photo, for its owner only.
 *
 * The store is private, so this is the only way a photo is ever seen: the
 * signed-in user must own the bill, or the answer is 404 — not 403, which
 * would confirm that someone else's bill exists. Never cached by shared
 * caches, and served so a browser cannot be talked into treating it as
 * anything but an image.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response('Not signed in', { status: 401 });

  const { id } = await params;
  const bill = await repo.findBill(user.id, id);
  const store = billStore();
  if (!bill || !store) return new Response('Not found', { status: 404 });

  const photo = await store.get(bill.storageKey);
  if (!photo) return new Response('Not found', { status: 404 });

  return new Response(photo.body, {
    headers: {
      'Content-Type': bill.contentType,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      // ?download=1 saves the file; otherwise it opens in the page.
      'Content-Disposition': `${new URL(request.url).searchParams.has('download') ? 'attachment' : 'inline'}; filename="bill-${bill.billDate ?? 'photo'}.jpg"`,
    },
  });
}
