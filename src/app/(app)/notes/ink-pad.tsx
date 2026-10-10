'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, PenLine, Plus, Redo2, Trash2, Undo2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  INK_LINE_GAP,
  INK_MAX_HEIGHT,
  INK_SHEET,
  INK_WIDTH,
  PEN_SIZES,
  hasRealPressure,
  simplifyStroke,
  strokeOutline,
  type Ink,
  type InkStroke,
  type PenSize,
} from '@/modules/notes/ink';

type Tool = 'pen' | 'eraser';
type Change =
  | { kind: 'add'; stroke: InkStroke }
  | { kind: 'erase'; removed: { index: number; stroke: InkStroke }[] };

const ERASER_RADIUS = 14;
const MARGIN = 72;

function toPath(stroke: InkStroke): Path2D {
  const outline = strokeOutline(stroke, !hasRealPressure(stroke));
  const path = new Path2D();
  if (outline.length === 0) return path;
  path.moveTo(outline[0]![0], outline[0]![1]);
  for (let i = 1; i < outline.length; i += 1) path.lineTo(outline[i]![0], outline[i]![1]);
  path.closePath();
  return path;
}

/**
 * Lined paper you can write on, with a finger, a stylus or an Apple Pencil.
 *
 * Pressure shapes the line when the pen reports it. Once a pen has touched
 * the page, fingers are ignored on it, so a resting palm leaves no marks.
 * Committed strokes are painted once onto one canvas; only the stroke being
 * written is redrawn as the pen moves, on a second canvas above it, so long
 * pages stay smooth on a tablet.
 */
export function InkPad({
  onChange,
}: {
  /**
   * Called with the page after every change, or null when it is blank. To
   * start a fresh page, the parent gives the pad a new `key`.
   */
  onChange: (ink: Ink | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);

  const strokes = useRef<InkStroke[]>([]);
  const paths = useRef(new WeakMap<InkStroke, Path2D>());
  const undoStack = useRef<Change[]>([]);
  const redoStack = useRef<Change[]>([]);
  const current = useRef<{ id: number; points: number[] } | null>(null);
  /** The undo entry for the eraser sweep in progress: one sweep, one undo. */
  const sweep = useRef<Extract<Change, { kind: 'erase' }> | null>(null);
  const penSeen = useRef(false);
  const frame = useRef(0);

  const [tool, setTool] = useState<Tool>('pen');
  const [size, setSize] = useState<PenSize>('medium');
  const [height, setHeight] = useState(INK_SHEET);
  const [scale, setScale] = useState(0);
  const [counts, setCounts] = useState({ strokes: 0, undo: 0, redo: 0 });

  const pathFor = useCallback((stroke: InkStroke) => {
    let path = paths.current.get(stroke);
    if (!path) {
      path = toPath(stroke);
      paths.current.set(stroke, path);
    }
    return path;
  }, []);

  const prepare = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      const ctx = canvas?.getContext('2d');
      const wrap = wrapRef.current;
      if (!canvas || !ctx || !wrap || scale === 0) return null;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      ctx.fillStyle = getComputedStyle(wrap).color;
      return ctx;
    },
    [scale],
  );

  const paintBase = useCallback(() => {
    const ctx = prepare(baseRef.current);
    if (!ctx) return;
    for (const stroke of strokes.current) ctx.fill(pathFor(stroke));
  }, [prepare, pathFor]);

  const paintLive = useCallback(() => {
    frame.current = 0;
    const ctx = prepare(liveRef.current);
    if (!ctx || !current.current) return;
    ctx.fill(toPath({ points: current.current.points, size: PEN_SIZES[size] }));
  }, [prepare, size]);

  const publish = useCallback(() => {
    setCounts({
      strokes: strokes.current.length,
      undo: undoStack.current.length,
      redo: redoStack.current.length,
    });
    onChange(
      strokes.current.length === 0
        ? null
        : { v: 1, width: INK_WIDTH, height, strokes: [...strokes.current] },
    );
  }, [height, onChange]);

  // Size the canvases to the page and the screen, and keep them sized.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale((entry?.contentRect.width ?? 0) / INK_WIDTH);
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    for (const canvas of [baseRef.current, liveRef.current]) {
      if (!canvas) continue;
      canvas.width = Math.round(INK_WIDTH * scale * dpr);
      canvas.height = Math.round(height * scale * dpr);
    }
    paintBase();
  }, [scale, height, paintBase]);

  // The ink follows the theme: repaint when Black and White switch.
  useEffect(() => {
    const observer = new MutationObserver(() => paintBase());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, [paintBase]);

  // The page height is part of the published page.
  useEffect(() => {
    if (strokes.current.length > 0) publish();
  }, [height, publish]);

  function point(event: PointerEvent | React.PointerEvent): [number, number, number] {
    const rect = liveRef.current!.getBoundingClientRect();
    const pressure = event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : 0.5;
    return [
      (event.clientX - rect.left) / scale,
      (event.clientY - rect.top) / scale,
      Math.round(pressure * 100),
    ];
  }

  function eraseAt(x: number, y: number) {
    const removed: { index: number; stroke: InkStroke }[] = [];
    strokes.current = strokes.current.filter((stroke, index) => {
      const reach = ERASER_RADIUS + stroke.size;
      for (let i = 0; i < stroke.points.length; i += 3) {
        if (Math.hypot(stroke.points[i]! - x, stroke.points[i + 1]! - y) <= reach) {
          removed.push({ index, stroke });
          return false;
        }
      }
      return true;
    });
    if (removed.length === 0) return;
    // One sweep of the eraser is one undo, however many strokes it took.
    if (sweep.current) {
      sweep.current.removed.push(...removed);
    } else {
      sweep.current = { kind: 'erase', removed };
      undoStack.current.push(sweep.current);
    }
    redoStack.current = [];
    paintBase();
    publish();
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.pointerType === 'pen') penSeen.current = true;
    // Palm rejection: with a pen in use, a finger on the page is a hand resting.
    if (event.pointerType === 'touch' && penSeen.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    try {
      // Keeps the stroke when the pen strays off the page mid-line.
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // The pointer was already released (a very quick tap); draw without capture.
    }
    current.current = { id: event.pointerId, points: [...point(event)] };
    sweep.current = null;
    if (tool === 'eraser') {
      const [x, y] = point(event);
      eraseAt(x, y);
    } else {
      paintLive();
    }
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const live = current.current;
    if (!live || live.id !== event.pointerId) return;
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    for (const sample of samples.length > 0 ? samples : [event.nativeEvent]) {
      const [x, y, p] = point(sample);
      if (tool === 'eraser') eraseAt(x, y);
      else live.points.push(x, y, p);
    }
    if (tool === 'pen' && !frame.current) frame.current = requestAnimationFrame(paintLive);
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    const live = current.current;
    if (!live) return;
    if (live.id !== event.pointerId) return;
    current.current = null;
    sweep.current = null;
    if (tool === 'eraser') return;
    const points = simplifyStroke(live.points);
    if (points.length >= 3) {
      const stroke: InkStroke = { points, size: PEN_SIZES[size] };
      strokes.current.push(stroke);
      undoStack.current.push({ kind: 'add', stroke });
      redoStack.current = [];
      // Writing near the bottom of the paper adds more below.
      const lowest = points.reduce((m, v, i) => (i % 3 === 1 ? Math.max(m, v) : m), 0);
      if (lowest > height - INK_LINE_GAP * 2 && height < INK_MAX_HEIGHT) {
        setHeight((h) => Math.min(INK_MAX_HEIGHT, h + INK_SHEET));
      }
    }
    prepare(liveRef.current);
    paintBase();
    publish();
  }

  function undo() {
    const change = undoStack.current.pop();
    if (!change) return;
    if (change.kind === 'add') {
      strokes.current = strokes.current.filter((s) => s !== change.stroke);
    } else {
      for (const { index, stroke } of [...change.removed].sort((a, b) => a.index - b.index)) {
        strokes.current.splice(Math.min(index, strokes.current.length), 0, stroke);
      }
    }
    redoStack.current.push(change);
    paintBase();
    publish();
  }

  function redo() {
    const change = redoStack.current.pop();
    if (!change) return;
    if (change.kind === 'add') {
      strokes.current.push(change.stroke);
    } else {
      const gone = new Set(change.removed.map((r) => r.stroke));
      strokes.current = strokes.current.filter((s) => !gone.has(s));
    }
    undoStack.current.push(change);
    paintBase();
    publish();
  }

  function clearPage() {
    if (strokes.current.length === 0) return;
    undoStack.current.push({
      kind: 'erase',
      removed: strokes.current.map((stroke, index) => ({ index, stroke })),
    });
    redoStack.current = [];
    strokes.current = [];
    paintBase();
    publish();
  }

  const gap = INK_LINE_GAP * scale;
  const toolButton = (active: boolean) =>
    cn(
      'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs transition-colors duration-[var(--duration-fast)]',
      active
        ? 'bg-text-primary font-medium text-surface-sunken'
        : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary',
    );
  const iconButton =
    'inline-flex size-9 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-raised hover:text-text-primary disabled:opacity-35 disabled:hover:bg-transparent';

  return (
    <div className="flex flex-col gap-3">
      <div
        role="toolbar"
        aria-label="Writing tools"
        className="ui-card flex flex-wrap items-center gap-1 self-start rounded-full p-1"
      >
        <button
          type="button"
          aria-pressed={tool === 'pen'}
          onClick={() => setTool('pen')}
          className={toolButton(tool === 'pen')}
        >
          <PenLine aria-hidden className="size-3.5" />
          Pen
        </button>
        <button
          type="button"
          aria-pressed={tool === 'eraser'}
          onClick={() => setTool('eraser')}
          className={toolButton(tool === 'eraser')}
        >
          <Eraser aria-hidden className="size-3.5" />
          Eraser
        </button>
        <span aria-hidden className="mx-1 h-5 w-px bg-border-subtle" />
        {(Object.keys(PEN_SIZES) as PenSize[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-label={`${key[0]!.toUpperCase()}${key.slice(1)} pen`}
            aria-pressed={size === key}
            onClick={() => {
              setSize(key);
              setTool('pen');
            }}
            className={cn(
              iconButton,
              size === key && tool === 'pen' && 'bg-surface-raised text-text-primary',
            )}
          >
            <span
              aria-hidden
              className="rounded-full bg-current"
              style={{ width: PEN_SIZES[key] + 2, height: PEN_SIZES[key] + 2 }}
            />
          </button>
        ))}
        <span aria-hidden className="mx-1 h-5 w-px bg-border-subtle" />
        <button
          type="button"
          aria-label="Undo"
          title="Undo"
          onClick={undo}
          disabled={counts.undo === 0}
          className={iconButton}
        >
          <Undo2 aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Redo"
          title="Redo"
          onClick={redo}
          disabled={counts.redo === 0}
          className={iconButton}
        >
          <Redo2 aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Clear the page"
          title="Clear the page"
          onClick={clearPage}
          disabled={counts.strokes === 0}
          className={iconButton}
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      </div>

      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden rounded-2xl border border-border-subtle bg-surface-inset/60 text-text-primary shadow-(--shadow-edge)"
        style={{
          height: height * scale || INK_SHEET / 2,
          backgroundImage: gap
            ? `linear-gradient(to right, transparent ${MARGIN * scale - 1}px, color-mix(in oklch, var(--negative) 35%, transparent) ${MARGIN * scale - 1}px, color-mix(in oklch, var(--negative) 35%, transparent) ${MARGIN * scale}px, transparent ${MARGIN * scale}px), repeating-linear-gradient(to bottom, transparent 0, transparent ${gap - 1}px, var(--border-subtle) ${gap - 1}px, var(--border-subtle) ${gap}px)`
            : undefined,
        }}
      >
        <canvas ref={baseRef} aria-hidden className="absolute inset-0 size-full" />
        <canvas
          ref={liveRef}
          role="img"
          aria-label={
            counts.strokes === 0
              ? 'Blank page. Write here with your finger, a stylus or an Apple Pencil.'
              : `Handwritten page, ${counts.strokes} strokes`
          }
          className={cn(
            'absolute inset-0 size-full touch-none select-none',
            tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair',
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {counts.strokes === 0 && (
          <p
            aria-hidden
            className="pointer-events-none absolute top-4 left-1/2 w-max -translate-x-1/2 text-sm text-text-muted"
          >
            Write here
          </p>
        )}
      </div>

      {height < INK_MAX_HEIGHT && (
        <button
          type="button"
          onClick={() => setHeight((h) => Math.min(INK_MAX_HEIGHT, h + INK_SHEET))}
          className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          <Plus aria-hidden className="size-3.5" />
          More paper
        </button>
      )}
    </div>
  );
}

/**
 * Render a page for reading: black ink on white, in slices short enough
 * that the writing stays large in each image. Returns base64 PNGs, top to
 * bottom, without the data-URL prefix.
 */
export function renderForReading(ink: Ink): string[] {
  const SLICE = 1400;
  const bottom = ink.strokes.reduce((m, s) => {
    for (let i = 1; i < s.points.length; i += 3) m = Math.max(m, s.points[i]!);
    return m;
  }, 0);
  const total = Math.min(ink.height, bottom + INK_LINE_GAP);
  const slices: string[] = [];
  for (let top = 0; top < total; top += SLICE) {
    const h = Math.min(SLICE, total - top);
    const canvas = document.createElement('canvas');
    canvas.width = INK_WIDTH;
    canvas.height = Math.ceil(h);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(0, -top);
    ctx.fillStyle = 'black';
    for (const stroke of ink.strokes) ctx.fill(toPath(stroke));
    slices.push(canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, ''));
  }
  return slices;
}
