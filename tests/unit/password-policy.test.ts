import { describe, expect, it } from 'vitest';
import { isCommonPassword } from '@/lib/password-policy';
import { signUpSchema } from '@/modules/identity/validators';

const base = {
  email: 'someone@example.com',
  displayName: 'Someone',
  dateOfBirth: '1990-01-01',
  acceptTerms: 'on',
};

function passwordErrors(password: string): string[] {
  const result = signUpSchema.safeParse({ ...base, password });
  if (result.success) return [];
  return result.error.issues.filter((i) => i.path[0] === 'password').map((i) => i.message);
}

describe('password policy', () => {
  it('needs eight characters, not a character-class checklist', () => {
    expect(passwordErrors('short')).toEqual(['Use at least 8 characters']);
    // All lower case, no digit, no symbol: allowed, because length is the rule.
    expect(passwordErrors('riverlampcactus')).toEqual([]);
    expect(passwordErrors('eightchr')).toEqual([]);
  });

  it('refuses the passwords everyone guesses first', () => {
    for (const weak of [
      'password',
      'Password123',
      '12345678',
      'qwertyuiop',
      'aaaaaaaa',
      'abcdefgh',
    ]) {
      expect(passwordErrors(weak), weak).toEqual([
        'That password is too common — add a word or two to make it yours',
      ]);
    }
  });

  it('recognises sequences and repeats, not just the list', () => {
    expect(isCommonPassword('23456789')).toBe(true);
    expect(isCommonPassword('zzzzzzzzzz')).toBe(true);
    expect(isCommonPassword('lamp river 7')).toBe(false);
  });
});
