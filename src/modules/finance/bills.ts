import { newId } from '@/lib/db/id';
import { conflict, invalid, notFound, ok, rateLimited, type Result } from '@/lib/result';
import { consume, RULES } from '@/lib/security/rate-limit';
import { billStore } from '@/lib/storage/bills';
import * as repo from './repository';
import type { Bill } from './schema';

/**
 * Keeping a bill's photo.
 *
 * The browser has already shrunk the photo to a JPEG of at most ~1600 px —
 * which also drops its EXIF data, location included — so what arrives here
 * is small. It is still checked as if it were not: a JPEG by its first
 * bytes, not by what the request claims, and under a hard size limit.
 */

export const MAX_BILL_BYTES = 1_500_000;

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function billPhotosEnabled(): boolean {
  return billStore() !== null;
}

export async function saveBillPhoto(
  userId: string,
  input: {
    bytes: Uint8Array;
    transactionId: string | null;
    merchant: string | null;
    amountMinor: bigint | null;
    currency: string | null;
    billDate: string | null;
  },
): Promise<Result<Bill>> {
  const store = billStore();
  if (!store) return conflict('Bill photos are not switched on', 'storage_off');

  if (input.bytes.length === 0 || input.bytes.length > MAX_BILL_BYTES || !isJpeg(input.bytes)) {
    return invalid('photo', 'That photo could not be saved. Try taking it again.');
  }

  if (input.transactionId) {
    const tx = await repo.findTransaction(userId, input.transactionId);
    if (!tx) return notFound();
  }

  const [hour, day] = await Promise.all([
    consume(`bills:hour:${userId}`, RULES.billUploadsPerHour),
    consume(`bills:day:${userId}`, RULES.billUploadsPerDay),
  ]);
  if (!hour.allowed || !day.allowed)
    return rateLimited(hour.allowed ? day.retryAfterSeconds : hour.retryAfterSeconds);

  const id = newId();
  const storageKey = `bills/${userId}/${id}.jpg`;
  await store.put(storageKey, input.bytes, 'image/jpeg');

  try {
    return ok(
      await repo.insertBill(userId, {
        id,
        transactionId: input.transactionId,
        storageKey,
        contentType: 'image/jpeg',
        sizeBytes: input.bytes.length,
        merchant: input.merchant?.slice(0, 120) ?? null,
        amountMinor: input.amountMinor,
        currency: input.currency,
        billDate: input.billDate,
      }),
    );
  } catch (error) {
    // Never leave a photo with no record pointing at it.
    await store.delete([storageKey]).catch(() => undefined);
    throw error;
  }
}

export async function deleteBillPhoto(userId: string, id: string): Promise<Result<null>> {
  const key = await repo.deleteBill(userId, id);
  if (!key) return notFound();
  await billStore()?.delete([key]);
  return ok(null);
}

/**
 * Remove every photo an account owns from storage. Called before the account
 * row is deleted (which removes the records by cascade). A failure is logged
 * by count only and does not block the deletion the user asked for.
 */
export async function deleteAllBillPhotos(userId: string): Promise<void> {
  const store = billStore();
  if (!store) return;
  const keys = await repo.billKeysForUser(userId);
  for (let i = 0; i < keys.length; i += 500) {
    try {
      await store.delete(keys.slice(i, i + 500));
    } catch {
      console.error(
        `Account deletion: ${keys.length - i} bill photos could not be removed from storage`,
      );
      return;
    }
  }
}
