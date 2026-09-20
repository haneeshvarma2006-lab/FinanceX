import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies a correct password', async () => {
    const digest = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(digest, 'correct horse battery staple')).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const digest = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(digest, 'Correct horse battery staple')).toBe(false);
    expect(await verifyPassword(digest, '')).toBe(false);
  });

  it('uses argon2id with a per-hash salt', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');

    expect(a).toMatch(/^\$argon2id\$/);
    expect(a).not.toBe(b); // distinct salts
    expect(await verifyPassword(b, 'same password')).toBe(true);
  });

  it('never embeds the plaintext', async () => {
    const digest = await hashPassword('hunter2');
    expect(digest).not.toContain('hunter2');
  });

  it('treats a corrupt digest as a failed verification, not an error', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
    expect(await verifyPassword('', 'anything')).toBe(false);
  });

  it('handles unicode and long passphrases', async () => {
    const pass = '🔐 गोपनीय passphrase with spaces ' + 'x'.repeat(200);
    const digest = await hashPassword(pass);
    expect(await verifyPassword(digest, pass)).toBe(true);
  });
});
