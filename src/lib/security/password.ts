import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id parameters. OWASP's current floor is 19 MiB with t=2, p=1; this
 * doubles the memory cost, which is the parameter that actually hurts GPU
 * attackers.
 */
const OPTIONS = {
  memoryCost: 39_936, // KiB (39 MiB)
  timeCost: 3,
  parallelism: 1,
} as const;

/** Argon2 handles its own per-hash salt; the salt travels inside the digest. */
export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, OPTIONS);
}

/**
 * Returns false rather than throwing on a malformed digest, so a corrupt row
 * reads as "wrong password" instead of a 500 that tells the caller the account
 * exists and is broken.
 */
export async function verifyPassword(digest: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(digest, plaintext, OPTIONS);
  } catch {
    return false;
  }
}
