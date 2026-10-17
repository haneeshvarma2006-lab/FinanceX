import { describe, expect, it } from 'vitest';
import { shortDay } from '@/lib/dates';

describe('shortDay', () => {
  it('names today and yesterday', () => {
    expect(shortDay('2026-10-17', '2026-10-17')).toBe('Today');
    expect(shortDay('2026-10-16', '2026-10-17')).toBe('Yesterday');
  });
  it('crosses a month and a year boundary for yesterday', () => {
    expect(shortDay('2026-09-30', '2026-10-01')).toBe('Yesterday');
    expect(shortDay('2025-12-31', '2026-01-01')).toBe('Yesterday');
  });
  it('drops the year only within the current one', () => {
    expect(shortDay('2026-03-05', '2026-10-17')).toBe('5 Mar');
    expect(shortDay('2025-03-05', '2026-10-17')).toBe('5 Mar 2025');
  });
});
