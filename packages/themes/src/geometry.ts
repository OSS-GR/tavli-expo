/**
 * Layout math: where checkers, triangles, tray slices and dice go.
 *
 * Every function reads the numbers from a `BoardLayout`. Nothing here is
 * specific to one theme. Results are normalized (0..1 of the board width
 * and height), like the layout itself.
 *
 * This file has only type imports, so Node can run it directly
 * (the preview tool does).
 */

import type { BoardLayout, PointSlot, Rect, Side, StackSlot, Vec } from './types';

/** The stack of one slot, ready to draw. */
export interface StackPlacement {
  /** Centers of the checkers to draw, from the base outwards. */
  centers: Vec[];
  /** Checker radius in width units. */
  radius: number;
  /** Total checkers in the slot. */
  count: number;
  /** The number on the count badge, or `null` when every checker is drawn. */
  badge: number | null;
}

const isHorizontal = (side: Side): boolean => side === 'left' || side === 'right';

/** The point slot with this index (1..24). Throws if the layout has no such point. */
export function getPoint(layout: BoardLayout, index: number): PointSlot {
  const p = layout.points.find((q) => q.index === index);
  if (!p) throw new Error(`Layout has no point ${index}`);
  return p;
}

/** Slot depth (base edge to far edge) in width units. */
export function slotDepth(layout: BoardLayout, slot: StackSlot): number {
  return isHorizontal(slot.base) ? slot.rect.w : slot.rect.h / layout.aspectRatio;
}

/** A position `along` width units from the slot base, on the slot's middle line. */
function alongSlot(layout: BoardLayout, slot: StackSlot, along: number): Vec {
  const r = slot.rect;
  const a = layout.aspectRatio;
  switch (slot.base) {
    case 'left':
      return { x: r.x + along, y: r.y + r.h / 2 };
    case 'right':
      return { x: r.x + r.w - along, y: r.y + r.h / 2 };
    case 'top':
      return { x: r.x + r.w / 2, y: r.y + along * a };
    case 'bottom':
      return { x: r.x + r.w / 2, y: r.y + r.h - along * a };
  }
}

/**
 * Checker centers for `count` checkers on a point or a bar half.
 *
 * Checkers sit `stackSpacing` apart. If they do not fit in `maxStackDepth`
 * of the slot, the spacing shrinks so they overlap. At most `maxVisible`
 * checkers are drawn; the rest show as a count badge on the last one.
 */
export function stackCenters(layout: BoardLayout, slot: StackSlot, count: number): StackPlacement {
  const { radius, stackSpacing, stackInset, maxStackDepth, maxVisible } = layout.checker;
  const visible = Math.max(0, Math.min(count, maxVisible));
  const room = slotDepth(layout, slot) * maxStackDepth - stackInset;
  const step = visible <= 1 ? 0 : Math.min(stackSpacing, (room - 2 * radius) / (visible - 1));
  const centers: Vec[] = [];
  for (let k = 0; k < visible; k++) {
    centers.push(alongSlot(layout, slot, stackInset + radius + k * step));
  }
  return { centers, radius, count, badge: count > maxVisible ? count : null };
}

/** The three corners of a point triangle: base start, base end, tip. */
export function pointTriangle(layout: BoardLayout, point: PointSlot): [Vec, Vec, Vec] {
  const { x, y, w, h } = point.rect;
  const d = layout.pointShape.depth;
  const i = layout.pointShape.baseInset;
  switch (point.base) {
    case 'left':
      return [
        { x, y: y + i * h },
        { x, y: y + h - i * h },
        { x: x + d * w, y: y + h / 2 },
      ];
    case 'right':
      return [
        { x: x + w, y: y + i * h },
        { x: x + w, y: y + h - i * h },
        { x: x + w - d * w, y: y + h / 2 },
      ];
    case 'top':
      return [
        { x: x + i * w, y },
        { x: x + w - i * w, y },
        { x: x + w / 2, y: y + d * h },
      ];
    case 'bottom':
      return [
        { x: x + i * w, y: y + h },
        { x: x + w - i * w, y: y + h },
        { x: x + w / 2, y: y + h - d * h },
      ];
  }
}

/**
 * Borne-off checkers in a tray, seen from their edge: one thin rect each.
 * They line up from the tray base. If 15 do not fit, they squeeze together.
 */
export function trayRects(layout: BoardLayout, slot: StackSlot, count: number): Rect[] {
  const a = layout.aspectRatio;
  const t = layout.checker.trayThickness;
  const pad = 0.12; // free space on each side, as a fraction of the tray's cross size
  const depth = slotDepth(layout, slot);
  const inset = layout.checker.stackInset;
  const step = count <= 1 ? t : Math.min(t * 1.08, (depth - 2 * inset - t) / (count - 1));
  const out: Rect[] = [];
  const r = slot.rect;
  for (let k = 0; k < count; k++) {
    const along = inset + k * step;
    if (isHorizontal(slot.base)) {
      const x = slot.base === 'left' ? r.x + along : r.x + r.w - along - t;
      out.push({ x, y: r.y + r.h * pad, w: t, h: r.h * (1 - 2 * pad) });
    } else {
      const y = slot.base === 'top' ? r.y + along * a : r.y + r.h - (along + t) * a;
      out.push({ x: r.x + r.w * pad, y, w: r.w * (1 - 2 * pad), h: t * a });
    }
  }
  return out;
}

/**
 * Centers for 2 dice (side by side) or 4 dice (doubles, a 2 x 2 grid)
 * inside the dice area.
 */
export function diceCenters(layout: BoardLayout, count: 2 | 4): Vec[] {
  const r = layout.diceArea;
  const a = layout.aspectRatio;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const gap = layout.dice.size * 0.65; // center offset in width units
  if (count === 2) {
    // Along the longer side of the area (in points, not in normalized units).
    return r.w >= r.h / a
      ? [
          { x: cx - gap, y: cy },
          { x: cx + gap, y: cy },
        ]
      : [
          { x: cx, y: cy - gap * a },
          { x: cx, y: cy + gap * a },
        ];
  }
  const out: Vec[] = [];
  for (const sy of [-1, 1])
    for (const sx of [-1, 1]) out.push({ x: cx + sx * gap, y: cy + sy * gap * a });
  return out;
}

const MIRRORED_SIDE: Readonly<Record<Side, Side>> = {
  left: 'right',
  right: 'left',
  top: 'top',
  bottom: 'bottom',
};

/** A rect mirrored left to right across the middle of the board. */
export function mirrorRect(r: Rect): Rect {
  return { x: 1 - r.x - r.w, y: r.y, w: r.w, h: r.h };
}

function mirrorSlot<T extends StackSlot>(slot: T): T {
  return { ...slot, rect: mirrorRect(slot.rect), base: MIRRORED_SIDE[slot.base] };
}

/**
 * The layout mirrored left to right (Settings → Home board, #175). Every
 * slot moves to the other side: points, bar halves, trays, fields and the
 * dice area. Point numbers and point tones stay with their points, so the
 * player's path runs the other way round.
 *
 * The image layers, the board shadow and the lamp do not change: the light
 * still comes from the same side of the screen. So the art must fit both
 * ways. `isMirrorSymmetric` checks that the layout allows it.
 */
export function mirrorLayout(layout: BoardLayout): BoardLayout {
  return {
    ...layout,
    fields: layout.fields.map(mirrorRect),
    points: layout.points.map(mirrorSlot),
    bar: {
      rect: mirrorRect(layout.bar.rect),
      player: mirrorSlot(layout.bar.player),
      opponent: mirrorSlot(layout.bar.opponent),
    },
    trays: { player: mirrorSlot(layout.trays.player), opponent: mirrorSlot(layout.trays.opponent) },
    diceArea: mirrorRect(layout.diceArea),
  };
}

/** Every area the board art must line up with: fields, bar, bar halves, trays, points. */
function artRects(layout: BoardLayout): Rect[] {
  return [
    ...layout.fields,
    layout.bar.rect,
    layout.bar.player.rect,
    layout.bar.opponent.rect,
    layout.trays.player.rect,
    layout.trays.opponent.rect,
    ...layout.points.map((p) => p.rect),
  ];
}

const sameRect = (p: Rect, q: Rect, epsilon: number): boolean =>
  Math.abs(p.x - q.x) <= epsilon &&
  Math.abs(p.y - q.y) <= epsilon &&
  Math.abs(p.w - q.w) <= epsilon &&
  Math.abs(p.h - q.h) <= epsilon;

/**
 * True when the mirrored layout puts every field, bar half, tray and point
 * on an area of the same size that the layout already has. Then the board
 * art fits the mirrored layout without being mirrored itself.
 */
export function isMirrorSymmetric(layout: BoardLayout, epsilon = 1e-4): boolean {
  const own = artRects(layout);
  return artRects(mirrorLayout(layout)).every((m) => own.some((r) => sameRect(m, r, epsilon)));
}

/** True when two rects share area (touching edges do not count). */
export function rectsOverlap(p: Rect, q: Rect, epsilon = 1e-9): boolean {
  return (
    p.x + p.w - epsilon > q.x &&
    q.x + q.w - epsilon > p.x &&
    p.y + p.h - epsilon > q.y &&
    q.y + q.h - epsilon > p.y
  );
}

/** True when the rect lies inside 0..1 on both axes and has a positive size. */
export function rectInsideUnit(r: Rect, epsilon = 1e-9): boolean {
  return (
    r.w > 0 &&
    r.h > 0 &&
    r.x >= -epsilon &&
    r.y >= -epsilon &&
    r.x + r.w <= 1 + epsilon &&
    r.y + r.h <= 1 + epsilon
  );
}
