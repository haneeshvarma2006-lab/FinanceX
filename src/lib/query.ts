import { z } from 'zod';

/**
 * Shared list-query primitives: pagination, sorting, search.
 *
 * Centralised because every list needs the same guarantees and getting them
 * subtly different per module is how one endpoint ends up unbounded.
 */

/** Hard ceiling. A caller asking for more gets this, not an error. */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function toOffset({ page, pageSize }: Pagination): { limit: number; offset: number } {
  return { limit: pageSize, offset: (page - 1) * pageSize };
}

export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

export function paginate<T>(items: T[], total: number, pagination: Pagination): Page<T> {
  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));

  return {
    items,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
    totalPages,
    hasPrevious: pagination.page > 1,
    hasNext: pagination.page < totalPages,
  };
}

/**
 * Build a sort parser bound to an allow-list of columns.
 *
 * The allow-list is the point: a sort key that reaches a query builder without
 * one lets a caller order by a column they should not be able to observe, and
 * in a raw-SQL codebase it would be an injection point outright.
 */
export function sortSchema<const T extends readonly string[]>(allowed: T, fallback: T[number]) {
  return z.object({
    sort: z
      .string()
      .optional()
      .transform((value) => (value && allowed.includes(value) ? value : fallback))
      .pipe(z.custom<T[number]>()),
    direction: z.enum(['asc', 'desc']).default('desc'),
  });
}

/**
 * Free-text search term.
 *
 * Bounded, trimmed, and empty-as-undefined so a blank box does not become a
 * filter that matches everything through a LIKE '%%'.
 */
export const searchSchema = z.object({
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value ? value : undefined)),
});

/**
 * Escape a user term for a SQL LIKE/ILIKE pattern.
 *
 * Without this, a term containing % or _ silently becomes a wildcard — so
 * searching for "50%" would match far more than the user asked for.
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function containsPattern(term: string): string {
  return `%${escapeLike(term)}%`;
}
