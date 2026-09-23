/**
 * The product's brand, in one place.
 *
 * Every user-facing occurrence of the name reads from here, and an
 * architecture test fails if the literal string appears anywhere else in
 * `src/`. That is the whole point: the last rename touched sixty files, and
 * the next one should touch this one.
 *
 * Nothing here asserts that the name is legally available. `docs/NAME-RESEARCH.md`
 * records what was and was not checked; no trademark clearance or domain
 * registration has been obtained for it.
 */
export const brand = {
  /** The full product name, as it appears in prose and in metadata. */
  name: 'Nested Flow',

  /**
   * Where space is tight — the PWA launcher label, which some platforms clip
   * around twelve characters.
   */
  shortName: 'Nested Flow',

  /**
   * The wordmark, split so the two halves can be coloured differently. Keep
   * `lead + accent` equal to `name` or the header stops matching the title.
   */
  wordmark: { lead: 'Nested', accent: 'Flow' },

  description: 'Tasks, habits, goals, finances and trading — connected.',

  /**
   * The possessive form, because "Nested Flow's" is built by hand in a few
   * sentences and English possessives are not a string concatenation problem
   * worth solving generically.
   */
  possessive: "Nested Flow's",

  /**
   * Prefix for cookie names and other namespaced runtime identifiers. Lower
   * case, no spaces: these end up in HTTP headers and global variables.
   */
  slug: 'nestedflow',
} as const;

/** `Nested Flow <no-reply@example.invalid>` — the default From for email. */
export function emailFrom(address: string): string {
  return `${brand.name} <${address}>`;
}
