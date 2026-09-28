/**
 * Passwords too common to allow.
 *
 * NIST 800-63B asks for exactly two things of a user-chosen password: a
 * minimum length, and a check against values known to be commonly used or
 * compromised. This is the second. It is a short list of the passwords that
 * top every published breach ranking, plus the patterns people reach for when
 * a form demands "at least 8 characters" — a run of one key, a straight row
 * of the keyboard, the alphabet or the digits in order.
 *
 * Pure data, no imports, so the sign-up form can warn as you type with the
 * same rule the server enforces.
 */
const COMMON = new Set([
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  '12345678910',
  '123123123',
  '111111111',
  '000000000',
  '987654321',
  '11223344',
  '12344321',
  'password',
  'password1',
  'password12',
  'password123',
  'password1234',
  'passw0rd',
  'p@ssword',
  'p@ssw0rd',
  'pa$$word',
  'passwort',
  'motdepasse',
  'iloveyou',
  'iloveyou1',
  'princess',
  'sunshine',
  'football',
  'baseball',
  'basketball',
  'superman',
  'batman123',
  'starwars',
  'pokemon1',
  'charlie1',
  'welcome1',
  'welcome123',
  'letmein1',
  'letmein123',
  'trustno1',
  'whatever',
  'qwertyui',
  'qwertyuiop',
  'qwerty123',
  'qwerty1234',
  '1q2w3e4r',
  '1q2w3e4r5t',
  'zaq12wsx',
  '1qaz2wsx',
  'asdfghjkl',
  'asdf1234',
  'zxcvbnm1',
  'q1w2e3r4',
  'abc12345',
  'abcd1234',
  'abcdefgh',
  'aa123456',
  'a1b2c3d4',
  'admin123',
  'administrator',
  'computer',
  'internet',
  'michael1',
  'jennifer',
  'jordan23',
  'master12',
  'monkey12',
  'dragon12',
  'shadow12',
  'freedom1',
  'mustang1',
  'liverpool',
  'chelsea1',
  'arsenal1',
  'manchester',
  'barcelona',
  'india123',
  'india@123',
  'bharat123',
  'krishna1',
  'ganesh123',
  'hanuman1',
  'mumbai123',
  'delhi123',
  'cricket1',
  'sachin10',
  'dhoni007',
  'virat18',
  'changeme',
  'changeme1',
  'secret123',
  'default1',
  'test1234',
  'testtest',
  'guest123',
  'money123',
  'trading1',
  'trader123',
  'nestedflow',
  'nestedflow1',
]);

const SEQUENCES = [
  '01234567890123456789',
  '98765432109876543210',
  'abcdefghijklmnopqrstuvwxyz',
  'zyxwvutsrqponmlkjihgfedcba',
  'qwertyuiopasdfghjklzxcvbnm',
  '1qaz2wsx3edc4rfv5tgb6yhn',
];

/** True for a password on the list, or one that is a single repeated key or a straight run. */
export function isCommonPassword(password: string): boolean {
  const p = password.toLowerCase();
  if (COMMON.has(p)) return true;
  if (/^(.)\1+$/.test(p)) return true;
  return SEQUENCES.some((sequence) => sequence.includes(p));
}

export const PASSWORD_MIN_LENGTH = 8;
