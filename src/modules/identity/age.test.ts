import { describe, expect, it } from 'vitest';
import { ageRejectionMessage, checkAge, MINIMUM_AGE_YEARS } from './age';

const NOW = new Date('2026-09-20T12:00:00Z');

describe('age gate', () => {
  it('admits someone comfortably over the minimum', () => {
    expect(checkAge('1990-01-01', NOW)).toEqual({ eligible: true, age: 36 });
  });

  it('admits someone on the day they reach the minimum', () => {
    // Exactly 18 today.
    const result = checkAge('2008-09-20', NOW);
    expect(result.eligible).toBe(true);
    if (result.eligible) expect(result.age).toBe(MINIMUM_AGE_YEARS);
  });

  it('refuses someone one day short of the minimum', () => {
    const result = checkAge('2008-09-21', NOW);
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toBe('underage');
  });

  it('refuses an obvious child', () => {
    const result = checkAge('2018-05-05', NOW);
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toBe('underage');
  });

  it('refuses a future date', () => {
    const result = checkAge('2030-01-01', NOW);
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toBe('future');
  });

  it('refuses an implausible age', () => {
    const result = checkAge('1850-01-01', NOW);
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toBe('implausible');
  });

  it.each(['', 'not-a-date', '2008-13-45', 'yesterday'])('refuses %s as invalid', (input) => {
    const result = checkAge(input, NOW);
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toBe('invalid');
  });

  it('handles a leap-day birthday without admitting someone early', () => {
    // Born 2008-02-29; on 2026-02-28 they are still 17.
    const dayBefore = checkAge('2008-02-29', new Date('2026-02-28T12:00:00Z'));
    expect(dayBefore.eligible).toBe(false);

    const onOrAfter = checkAge('2008-02-29', new Date('2026-03-01T12:00:00Z'));
    expect(onOrAfter.eligible).toBe(true);
  });

  it('never echoes the computed age back to the caller', () => {
    for (const reason of ['underage', 'implausible', 'invalid', 'future'] as const) {
      expect(ageRejectionMessage(reason)).not.toMatch(/\d+ years old/);
    }
    // The minimum itself is fine to state; the user's own age is not.
    expect(ageRejectionMessage('underage')).toContain(String(MINIMUM_AGE_YEARS));
  });
});
