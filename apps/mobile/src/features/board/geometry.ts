/**
 * Board layout math in screen points.
 *
 * The theme manifest gives every rect in normalized units (0..1 of the board).
 * These functions turn them into canvas points for one drawn board size.
 * Drawing, hit-testing and highlights all use these functions, so what the
 * player sees is exactly what the player can touch.
 *
 * Pure TypeScript: no React, no Skia. The hit-test helpers at the end are
 * worklets, so the gesture code can call them on the UI thread.
 */
import {
  pointTriangle,
  stackCenters,
  trayRects,
  type BoardLayout,
  type PointSlot,
  type Rect,
  type StackSlot,
  type Vec,
} from '@tavli/themes';

/** The board as drawn: its layout and where it sits on the canvas, in points. */
export interface BoardGeometry {
  readonly layout: BoardLayout;
  /** Top-left corner of the board on the canvas. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface ScreenRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Which half of the bar or which tray: the bottom player's ("player") or the top one's. */
export type BoardSide = 'player' | 'opponent';

/** A place where checkers sit. Point indexes are layout indexes (bottom player's view). */
export type Slot =
  | { readonly kind: 'point'; readonly index: number }
  | { readonly kind: 'bar'; readonly side: BoardSide }
  | { readonly kind: 'tray'; readonly side: BoardSide };

/** Checker centers of one stack, in points. */
export interface StackGeometry {
  readonly centers: readonly ScreenPoint[];
  readonly radius: number;
  /** The number on the count badge (on the last center), or `null`. */
  readonly badge: number | null;
}

/**
 * Fits the board into the space we have, keeping the layout's aspect ratio.
 * `margin` is kept free on every side (for the board shadow). The board is
 * centered in the space.
 */
export function fitBoard(
  layout: BoardLayout,
  available: { readonly width: number; readonly height: number },
  margin = 0,
): BoardGeometry {
  const innerW = Math.max(0, available.width - 2 * margin);
  const innerH = Math.max(0, available.height - 2 * margin);
  const width = Math.min(innerW, innerH * layout.aspectRatio);
  const height = width / layout.aspectRatio;
  return {
    layout,
    x: (available.width - width) / 2,
    y: (available.height - height) / 2,
    width,
    height,
  };
}

/**
 * Fits the board with room for its shadow on the table (the theme's
 * `layout.shadow` offset plus blur, measured on the available width).
 */
export function fitBoardWithShadow(
  layout: BoardLayout,
  available: { readonly width: number; readonly height: number },
): BoardGeometry {
  const margin = Math.ceil((layout.shadow.dy + layout.shadow.blur) * available.width);
  return fitBoard(layout, available, margin);
}

/**
 * The width / height of a box that `fitBoardWithShadow` fills edge to edge:
 * the board plus its shadow room on every side (a fraction of the width).
 * The classic board (#184) gets a box of this shape, as wide as the screen.
 */
export function boxRatioWithShadow(layout: BoardLayout): number {
  const margin = layout.shadow.dy + layout.shadow.blur;
  return 1 / ((1 - 2 * margin) / layout.aspectRatio + 2 * margin);
}

/** A normalized rect on the canvas. */
export function toScreenRect(geo: BoardGeometry, r: Rect): ScreenRect {
  return {
    x: geo.x + r.x * geo.width,
    y: geo.y + r.y * geo.height,
    width: r.w * geo.width,
    height: r.h * geo.height,
  };
}

/** A normalized point on the canvas. */
export function toScreenPoint(geo: BoardGeometry, v: Vec): ScreenPoint {
  return { x: geo.x + v.x * geo.width, y: geo.y + v.y * geo.height };
}

/** A stable string key for a slot: `p13`, `bar:player`, `tray:opponent`. */
export function slotKey(slot: Slot): string {
  return slot.kind === 'point' ? `p${slot.index}` : `${slot.kind}:${slot.side}`;
}

export function sameSlot(a: Slot, b: Slot): boolean {
  return slotKey(a) === slotKey(b);
}

/** The layout point with this index (1..24). */
export function layoutPoint(layout: BoardLayout, index: number): PointSlot {
  const point = layout.points.find((p) => p.index === index);
  if (point === undefined) throw new Error(`Layout has no point ${index}`);
  return point;
}

/** The layout area of a slot: its rect and the edge where its stack starts. */
export function stackSlotOf(layout: BoardLayout, slot: Slot): StackSlot {
  switch (slot.kind) {
    case 'point':
      return layoutPoint(layout, slot.index);
    case 'bar':
      return layout.bar[slot.side];
    case 'tray':
      return layout.trays[slot.side];
  }
}

/** The touch and stack area of a slot, in points. */
export function slotRect(geo: BoardGeometry, slot: Slot): ScreenRect {
  return toScreenRect(geo, stackSlotOf(geo.layout, slot).rect);
}

/** Checker radius on the points, in points. */
export function checkerRadius(geo: BoardGeometry): number {
  return geo.layout.checker.radius * geo.width;
}

/**
 * Checker radius on the bar, in points. The bar can be thinner than a
 * checker (Walnut Kafeneio: 34 pt bar, 40 pt checker), so bar checkers
 * shrink to fit it, with a small gap.
 */
export function barCheckerRadius(geo: BoardGeometry): number {
  const barHeight = geo.layout.bar.rect.h * geo.height;
  return Math.min(checkerRadius(geo), (barHeight / 2) * 0.94);
}

/** The layout, with smaller checkers for the bar (`stackCenters` reads the radius from it). */
function barLayout(geo: BoardGeometry): BoardLayout {
  const { checker } = geo.layout;
  const radius = barCheckerRadius(geo) / geo.width;
  const ratio = radius / checker.radius;
  return {
    ...geo.layout,
    checker: { ...checker, radius, stackSpacing: checker.stackSpacing * ratio },
  };
}

/**
 * How far a pinned checker (Plakoto) peeks out from under the checker that
 * pins it, in checker radii. The pinned checker sits at the base of the
 * point; the stack on top of it starts this much further along the point.
 */
export const PIN_PEEK = 0.6;

/** The layout with the stack moved along by `PIN_PEEK`: room for a pinned checker under it. */
function pinLayout(layout: BoardLayout): BoardLayout {
  const { checker } = layout;
  return {
    ...layout,
    checker: { ...checker, stackInset: checker.stackInset + PIN_PEEK * checker.radius },
  };
}

/**
 * Where `count` checkers sit in a point or a bar half.
 * At most `maxVisible` are drawn; the last one then carries the count badge.
 * A tray has no round checkers: use `trayGeometry`.
 *
 * `pinned`: a pinned checker lies under this stack (Plakoto). The stack then
 * starts `PIN_PEEK` radii further from the base, so the pinned checker
 * peeks out under it (`pinnedCenter`). Only points hold pinned checkers.
 */
export function stackGeometry(
  geo: BoardGeometry,
  slot: Slot,
  count: number,
  pinned = false,
): StackGeometry {
  if (slot.kind === 'tray') throw new Error('Trays hold flat checkers: use trayGeometry');
  const base = slot.kind === 'bar' ? barLayout(geo) : geo.layout;
  const layout = pinned && slot.kind === 'point' ? pinLayout(base) : base;
  const placement = stackCenters(layout, stackSlotOf(layout, slot), count);
  return {
    centers: placement.centers.map((v) => toScreenPoint(geo, v)),
    radius: placement.radius * geo.width,
    badge: placement.badge,
  };
}

/** Where the checker number `n` (0 = at the base) of a stack of `count` sits. */
export function stackPosition(
  geo: BoardGeometry,
  slot: Slot,
  count: number,
  n: number,
  pinned = false,
): ScreenPoint {
  const { centers } = stackGeometry(geo, slot, count, pinned);
  const last = centers[Math.min(n, centers.length - 1)];
  if (last === undefined) throw new Error('Empty stack');
  return last;
}

/** Where a pinned checker sits on a point: at the base, where a lone checker would be. */
export function pinnedCenter(geo: BoardGeometry, slot: Slot): ScreenPoint {
  return stackPosition(geo, slot, 1, 0);
}

/** Borne-off checkers in a tray, seen from their edge: one rect each. */
export function trayGeometry(geo: BoardGeometry, side: BoardSide, count: number): ScreenRect[] {
  return trayRects(geo.layout, geo.layout.trays[side], count).map((r) => toScreenRect(geo, r));
}

/** The center of the next free place in a tray (where a checker lands). */
export function trayLanding(geo: BoardGeometry, side: BoardSide, count: number): ScreenPoint {
  const rects = trayGeometry(geo, side, count + 1);
  const r = rects[rects.length - 1];
  if (r === undefined) throw new Error('Tray has no room');
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/** The three corners of a point triangle, in points. */
export function pointCorners(
  geo: BoardGeometry,
  index: number,
): [ScreenPoint, ScreenPoint, ScreenPoint] {
  const [a, b, c] = pointTriangle(geo.layout, layoutPoint(geo.layout, index));
  return [toScreenPoint(geo, a), toScreenPoint(geo, b), toScreenPoint(geo, c)];
}

const fmt = (n: number): string => (Math.round(n * 100) / 100).toString();

/** A point triangle as an SVG path string (Skia's `<Path>` reads it). */
export function pointPath(geo: BoardGeometry, index: number): string {
  const [a, b, c] = pointCorners(geo, index);
  return `M${fmt(a.x)} ${fmt(a.y)}L${fmt(b.x)} ${fmt(b.y)}L${fmt(c.x)} ${fmt(c.y)}Z`;
}

// ---------------------------------------------------------------------------
// Hit-testing. Worklets: the gesture code runs them on the UI thread.

/** One touch area: a slot and its rect in points. */
export interface HitArea {
  readonly key: string;
  readonly slot: Slot;
  readonly rect: ScreenRect;
}

/** Every touch area of the board: the 24 points, both bar halves and both trays. */
export function hitAreas(geo: BoardGeometry): HitArea[] {
  const slots: Slot[] = [
    ...geo.layout.points.map((p): Slot => ({ kind: 'point', index: p.index })),
    { kind: 'bar', side: 'player' },
    { kind: 'bar', side: 'opponent' },
    { kind: 'tray', side: 'player' },
    { kind: 'tray', side: 'opponent' },
  ];
  return slots.map((slot) => ({ key: slotKey(slot), slot, rect: slotRect(geo, slot) }));
}

/** Distance from a point to a rect, 0 when inside. */
export function distanceToRect(rect: ScreenRect, x: number, y: number): number {
  'worklet';
  const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.width));
  const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.height));
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * The index of the rect that holds (x, y). If none does, the nearest rect
 * within `snap` points. `-1` when nothing is close enough.
 * Rects never overlap (the theme tests check it), so the first hit wins.
 */
export function pickRect(rects: readonly ScreenRect[], x: number, y: number, snap = 0): number {
  'worklet';
  let best = -1;
  let bestDistance = snap;
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    if (rect === undefined) continue;
    const d = distanceToRect(rect, x, y);
    if (d === 0) return i;
    if (d <= bestDistance) {
      best = i;
      bestDistance = d;
    }
  }
  return best;
}

/** The slot under (x, y), or `null`. */
export function hitTest(areas: readonly HitArea[], x: number, y: number): Slot | null {
  const i = pickRect(
    areas.map((a) => a.rect),
    x,
    y,
  );
  return i < 0 ? null : (areas[i]?.slot ?? null);
}
