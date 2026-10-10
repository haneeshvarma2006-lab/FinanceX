import { describe, expect, it } from 'vitest';
import { inkBottom, inkPath, inkSchema, simplifyStroke, type Ink } from './ink';

const page = (strokes: Ink['strokes']): Ink => ({ v: 1, width: 1000, height: 700, strokes });

describe('ink', () => {
  it('drops repeated samples and rounds to whole units', () => {
    expect(simplifyStroke([10.2, 20.4, 50, 10.4, 20.3, 52, 30.6, 40.1, 130])).toEqual([
      10, 20, 50, 31, 40, 100,
    ]);
  });

  it('accepts a real page and rejects malformed ones', () => {
    const ok = page([{ points: [100, 100, 50, 140, 120, 60, 180, 110, 55], size: 5.5 }]);
    expect(inkSchema.safeParse(ok).success).toBe(true);

    for (const bad of [
      page([]),
      page([{ points: [1, 2], size: 5 }]),
      page([{ points: [1, 2, 150], size: 5 }]),
      page([{ points: [1.5, 2, 50], size: 5 }]),
      { ...ok, width: 800 },
      { ...ok, height: 100000 },
    ]) {
      expect(inkSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('draws a page as one compact SVG path and finds its lowest point', () => {
    const ink = page([
      { points: [100, 100, 50, 200, 150, 50, 300, 120, 50], size: 5.5 },
      { points: [100, 300, 40, 180, 320, 80], size: 5.5 },
    ]);
    const d = inkPath(ink);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d).toMatch(/^M\d+ \d+L/);
    expect(d).not.toMatch(/\./); // whole units only
    expect(inkBottom(ink)).toBe(320);
  });
});
