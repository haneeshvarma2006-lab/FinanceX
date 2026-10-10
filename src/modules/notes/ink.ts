import { getStroke } from 'perfect-freehand';
import { z } from 'zod';

/**
 * Handwriting, stored as the pen's path rather than as a picture.
 *
 * A page is a list of strokes; a stroke is the points the pen passed
 * through, each with the pressure it was pressed with. Coordinates are in a
 * fixed logical space 1000 units wide, so a page written on a phone and read
 * on an iPad scales instead of reflowing, and it stays sharp at any size.
 * Strokes carry no colour: they are drawn in the theme's ink, so a page
 * written in the Black theme reads just as well in White.
 *
 * Shared by the browser (drawing, exporting for recognition) and the server
 * (validating what is saved, drawing a stored page).
 */

export const INK_WIDTH = 1000;
/** One sheet of lined paper, in logical units. */
export const INK_SHEET = 700;
export const INK_MAX_HEIGHT = 4200;
export const INK_LINE_GAP = 56;

export const PEN_SIZES = { fine: 3.5, medium: 5.5, bold: 8.5 } as const;
export type PenSize = keyof typeof PEN_SIZES;

const MAX_STROKES = 3000;
const MAX_POINTS = 60_000;
const MAX_STROKE_POINTS = 4000;

export type InkStroke = {
  /** Flat [x, y, pressure, x, y, pressure, ...]; integers, pressure 0..100. */
  points: number[];
  size: number;
};

export type Ink = { v: 1; width: typeof INK_WIDTH; height: number; strokes: InkStroke[] };

export const inkSchema = z
  .object({
    v: z.literal(1),
    width: z.literal(INK_WIDTH),
    height: z.number().int().min(INK_SHEET).max(INK_MAX_HEIGHT),
    strokes: z
      .array(
        z.object({
          points: z
            .array(
              z
                .number()
                .int()
                .min(-50)
                .max(INK_MAX_HEIGHT + 50),
            )
            .min(3)
            .max(MAX_STROKE_POINTS * 3)
            .refine((p) => p.length % 3 === 0, 'Points come in threes'),
          size: z.number().min(1).max(20),
        }),
      )
      .min(1, 'The page is empty')
      .max(MAX_STROKES, 'That page has too many strokes'),
  })
  .refine(
    (ink) => ink.strokes.reduce((n, s) => n + s.points.length / 3, 0) <= MAX_POINTS,
    'That page is too large to save',
  )
  .refine(
    (ink) =>
      ink.strokes.every((s) => {
        for (let i = 0; i < s.points.length; i += 3) {
          const p = s.points[i + 2]!;
          if (p < 0 || p > 100) return false;
        }
        return true;
      }),
    'Pressure must be between 0 and 100',
  );

/**
 * Drop points closer than half a unit to the one before: a pen held still
 * reports dozens of identical samples, and storing them buys nothing.
 */
export function simplifyStroke(points: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 3) {
    const x = Math.round(points[i]!);
    const y = Math.round(points[i + 1]!);
    const p = Math.max(0, Math.min(100, Math.round(points[i + 2]!)));
    const n = out.length;
    if (n >= 3 && Math.abs(out[n - 3]! - x) + Math.abs(out[n - 2]! - y) < 1) continue;
    out.push(x, y, p);
  }
  return out;
}

/**
 * The outline of one stroke as a filled polygon, pressure-shaped. A pen
 * that reports no pressure (a mouse, most fingers) gets simulated pressure
 * from speed instead, so it still looks written rather than plotted.
 */
export function strokeOutline(stroke: InkStroke, simulate: boolean): [number, number][] {
  const input: [number, number, number][] = [];
  for (let i = 0; i < stroke.points.length; i += 3) {
    input.push([stroke.points[i]!, stroke.points[i + 1]!, stroke.points[i + 2]! / 100]);
  }
  return getStroke(input, {
    size: stroke.size,
    thinning: 0.55,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: simulate,
    last: true,
  }) as [number, number][];
}

/** Whether the strokes look like they came from a pen that reports real pressure. */
export function hasRealPressure(stroke: InkStroke): boolean {
  for (let i = 2; i < stroke.points.length; i += 3) {
    const p = stroke.points[i]!;
    if (p !== 50 && p !== 0) return true;
  }
  return false;
}

/** SVG path data for the whole page, rounded to whole units to keep it small. */
export function inkPath(ink: Pick<Ink, 'strokes'>): string {
  let d = '';
  for (const stroke of ink.strokes) {
    const outline = strokeOutline(stroke, !hasRealPressure(stroke));
    if (outline.length < 2) continue;
    d += `M${Math.round(outline[0]![0])} ${Math.round(outline[0]![1])}`;
    for (let i = 1; i < outline.length; i += 1) {
      d += `L${Math.round(outline[i]![0])} ${Math.round(outline[i]![1])}`;
    }
    d += 'Z';
  }
  return d;
}

/** The lowest point any stroke reaches, so a stored page can be cropped to its writing. */
export function inkBottom(ink: Pick<Ink, 'strokes'>): number {
  let bottom = 0;
  for (const stroke of ink.strokes) {
    for (let i = 1; i < stroke.points.length; i += 3) bottom = Math.max(bottom, stroke.points[i]!);
  }
  return bottom;
}
