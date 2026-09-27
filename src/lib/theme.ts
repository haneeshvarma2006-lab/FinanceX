/**
 * The two themes, Black and White, and where the choice is remembered.
 *
 * A plain cookie rather than localStorage so the server can render the right
 * theme on the first byte — no flash of the wrong one while a script runs.
 * It holds a preference, nothing identifying, so it needs no signing.
 */
export const THEME_COOKIE = 'nestedflow_theme';

export type Theme = 'dark' | 'light';

/** Anything but an explicit "light" is Black, the default. */
export function parseTheme(value: string | undefined): Theme {
  return value === 'light' ? 'light' : 'dark';
}
