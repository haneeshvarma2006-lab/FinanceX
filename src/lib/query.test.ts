import { describe, expect, it } from 'vitest';
import {
  containsPattern,
  escapeLike,
  MAX_PAGE_SIZE,
  paginate,
  paginationSchema,
  searchSchema,
  sortSchema,
  toOffset,
} from './query';

describe('pagination', () => {
  it('defaults sensibly', () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, pageSize: 25 });
  });

  it('coerces string query params', () => {
    expect(paginationSchema.parse({ page: '3', pageSize: '10' })).toEqual({
      page: 3,
      pageSize: 10,
    });
  });

  it('caps the page size, so no caller can request an unbounded list', () => {
    expect(() => paginationSchema.parse({ pageSize: MAX_PAGE_SIZE + 1 })).toThrow();
    expect(paginationSchema.parse({ pageSize: MAX_PAGE_SIZE }).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it('rejects a non-positive page', () => {
    expect(() => paginationSchema.parse({ page: 0 })).toThrow();
    expect(() => paginationSchema.parse({ page: -1 })).toThrow();
  });

  it('converts to limit and offset', () => {
    expect(toOffset({ page: 1, pageSize: 25 })).toEqual({ limit: 25, offset: 0 });
    expect(toOffset({ page: 3, pageSize: 10 })).toEqual({ limit: 10, offset: 20 });
  });

  it('describes the page correctly', () => {
    const page = paginate(['a', 'b'], 42, { page: 2, pageSize: 10 });

    expect(page.total).toBe(42);
    expect(page.totalPages).toBe(5);
    expect(page.hasPrevious).toBe(true);
    expect(page.hasNext).toBe(true);
  });

  it('handles an empty result without dividing by zero', () => {
    const page = paginate([], 0, { page: 1, pageSize: 25 });

    expect(page.totalPages).toBe(1);
    expect(page.hasPrevious).toBe(false);
    expect(page.hasNext).toBe(false);
  });

  it('knows the last page has no next', () => {
    const page = paginate(['a'], 21, { page: 3, pageSize: 10 });
    expect(page.hasNext).toBe(false);
    expect(page.hasPrevious).toBe(true);
  });
});

describe('sorting', () => {
  const schema = sortSchema(['createdAt', 'title', 'dueAt'] as const, 'createdAt');

  it('accepts an allowed column', () => {
    expect(schema.parse({ sort: 'title' }).sort).toBe('title');
  });

  it('falls back rather than trusting an arbitrary column name', () => {
    // A sort key reaching the query builder unchecked would let a caller order
    // by a column they should not observe.
    for (const hostile of ['passwordHash', 'users.password_hash', '1; drop table users', '']) {
      expect(schema.parse({ sort: hostile }).sort).toBe('createdAt');
    }
  });

  it('defaults when absent', () => {
    expect(schema.parse({}).sort).toBe('createdAt');
    expect(schema.parse({}).direction).toBe('desc');
  });

  it('only accepts asc or desc', () => {
    expect(schema.parse({ direction: 'asc' }).direction).toBe('asc');
    expect(() => schema.parse({ direction: 'sideways' })).toThrow();
  });
});

describe('search', () => {
  it('treats a blank box as no filter', () => {
    expect(searchSchema.parse({ q: '' }).q).toBeUndefined();
    expect(searchSchema.parse({ q: '   ' }).q).toBeUndefined();
    expect(searchSchema.parse({}).q).toBeUndefined();
  });

  it('trims and keeps a real term', () => {
    expect(searchSchema.parse({ q: '  rent  ' }).q).toBe('rent');
  });

  it('bounds the term length', () => {
    expect(() => searchSchema.parse({ q: 'x'.repeat(121) })).toThrow();
  });
});

describe('escapeLike', () => {
  it('escapes wildcards so they are matched literally', () => {
    // Searching for "50%" must not become "match anything after 50".
    expect(escapeLike('50%')).toBe('50\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('back\\slash')).toBe('back\\\\slash');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeLike('groceries')).toBe('groceries');
  });

  it('builds a contains pattern', () => {
    expect(containsPattern('rent')).toBe('%rent%');
    expect(containsPattern('100%')).toBe('%100\\%%');
  });
});
