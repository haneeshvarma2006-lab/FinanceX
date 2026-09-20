import { uuidv7 } from 'uuidv7';

/**
 * UUIDv7: time-ordered, so primary keys stay index-friendly, while remaining
 * non-sequential enough that an id does not leak how many rows exist or let a
 * caller walk to a neighbouring record.
 */
export function newId(): string {
  return uuidv7();
}
