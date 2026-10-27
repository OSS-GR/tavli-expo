/**
 * Touch logic of the board: which checkers can move, where they may go,
 * and what a tap or a drop means. Pure TypeScript.
 *
 * The rules come from the engine (`legalNextMoves`). This file only places
 * them on the screen, using the same rects that `geometry.ts` uses to draw
 * the points, bar and trays. The pickers at the end are worklets, so the
 * drag gesture can run them on the UI thread.
 */
import type { BoardState, Move, PlayerId, SourceMoves } from '@tavli/engine';

import {
  countIn,
  pinnedIn,
  slotOfDestination,
  slotOfOrigin,
  topCheckerKey,
  type BoardView,
} from './boardModel';
import {
  checkerRadius,
  pickRect,
  slotKey,
  slotRect,
  stackGeometry,
  stackPosition,
  trayGeometry,
  trayLanding,
  type BoardGeometry,
  type ScreenPoint,
  type ScreenRect,
  type Slot,
} from './geometry';

/** A tap may miss its target by this much (wireframe: 22 pt). */
export const SNAP_DISTANCE = 22;
/** A touch that moves less than this is a tap. At this distance a drag starts. */
export const TAP_SLOP = 8;
/**
 * A touch that stays put and lifts within this time is a tap. It is long,
 * so a slow press (touch, wait, lift) still selects. Gesture Handler's
 * default is 500 ms.
 */
export const TAP_MAX_MS = 1500;

/**
 * The board's two gestures (#174). They race: the first to activate wins.
 *
 * - The pan activates only once the finger moves `TAP_SLOP`: a drag.
 * - The tap fails once the finger moves more than `TAP_SLOP`. So the two
 *   never both fire, and no touch falls in a gap between them.
 *
 * A pan alone cannot see taps. When the finger lifts before the pan
 * activates, the pan FAILS, and its `onFinalize` gets `canceled: true`.
 */
export const BOARD_GESTURES = {
  pan: { minDistance: TAP_SLOP },
  tap: { maxDistance: TAP_SLOP, maxDuration: TAP_MAX_MS },
} as const;

/** Where a picked-up checker may go. */
export interface MoveTarget {
  readonly key: string;
  readonly slot: Slot;
  /** Touch area: the point rect or the tray. */
  readonly rect: ScreenRect;
  /** Where the checker lands: the ghost checker of the hint. */
  readonly landing: ScreenPoint;
  /** Radius of the ghost checker. */
  readonly r: number;
  readonly move: Move;
}

/** A checker the player may move now: the top checker of a point or the bar. */
export interface MovableSource {
  readonly key: string;
  readonly slot: Slot;
  readonly rect: ScreenRect;
  /** The top checker (the one that moves). */
  readonly checker: {
    readonly key: string;
    readonly x: number;
    readonly y: number;
    readonly r: number;
  };
  readonly targets: readonly MoveTarget[];
}

/**
 * Center and radius of the top checker of a slot with `count` checkers in
 * its stack (a tray: its last one). `pinned`: a pinned checker lies under
 * the stack (Plakoto), so the stack starts a little further along.
 */
export function slotTop(geo: BoardGeometry, slot: Slot, count: number, pinned = false) {
  if (slot.kind === 'tray') {
    const rects = trayGeometry(geo, slot.side, count);
    const r = rects[rects.length - 1];
    const radius = checkerRadius(geo);
    return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, r: radius } : null;
  }
  if (count === 0) return null;
  const { centers, radius } = stackGeometry(geo, slot, count, pinned);
  const p = centers[centers.length - 1];
  return p ? { x: p.x, y: p.y, r: radius } : null;
}

/**
 * Where a checker lands on `slot` (its stack holds `count` now, with a
 * pinned checker under it if `pinned`). A hit lands on the blot. A pin
 * (Plakoto) lands on top of the blot, which then peeks out under it.
 */
function landingOn(
  geo: BoardGeometry,
  slot: Slot,
  count: number,
  pinned: boolean,
  capture: Move['capture'],
): ScreenPoint {
  if (slot.kind === 'tray') return trayLanding(geo, slot.side, count);
  if (capture === 'hit') return stackPosition(geo, slot, 1, 0);
  if (capture === 'pin') return stackPosition(geo, slot, 1, 0, true);
  return stackPosition(geo, slot, count + 1, count, pinned);
}

/**
 * Every checker `mover` may move now, with its targets, in screen points.
 * When two dice reach the same target (bearing off), the lower die is used,
 * so the higher one stays for later.
 */
export function buildSources(
  geo: BoardGeometry,
  board: BoardState,
  view: BoardView,
  mover: PlayerId,
  legal: readonly SourceMoves[],
): MovableSource[] {
  const R = checkerRadius(geo);
  const sources: MovableSource[] = [];
  for (const group of legal) {
    const slot = slotOfOrigin(group.from, mover, view);
    const count = countIn(board, slot, view);
    const top = slotTop(geo, slot, count, pinnedIn(board, slot, view));
    const checkerKey = topCheckerKey(geo, slot, count);
    if (top === null || checkerKey === null) continue;
    const byTarget = new Map<string, MoveTarget>();
    for (const move of group.moves) {
      const to = slotOfDestination(move.to, mover, view);
      const key = slotKey(to);
      const old = byTarget.get(key);
      if (old !== undefined && old.move.die <= move.die) continue;
      const rect = slotRect(geo, to);
      const landing = landingOn(
        geo,
        to,
        countIn(board, to, view),
        pinnedIn(board, to, view),
        move.capture,
      );
      const r = to.kind === 'tray' ? Math.min(R, rect.height / 2) : R;
      byTarget.set(key, { key, slot: to, rect, landing, r, move });
    }
    sources.push({
      key: slotKey(slot),
      slot,
      rect: slotRect(geo, slot),
      checker: { key: checkerKey, ...top },
      targets: [...byTarget.values()],
    });
  }
  return sources;
}

// ---------------------------------------------------------------------------
// Taps and drops. Worklets.

/** The source under (x, y), or the nearest one within `snap`. `-1` if none. */
export function pickSource(
  sources: readonly MovableSource[],
  x: number,
  y: number,
  snap = 0,
): number {
  'worklet';
  return pickRect(
    sources.map((s) => s.rect),
    x,
    y,
    snap,
  );
}

/** The target of `source` under (x, y), or the nearest within `snap`. `-1` if none. */
export function pickTarget(source: MovableSource, x: number, y: number, snap = 0): number {
  'worklet';
  return pickRect(
    source.targets.map((t) => t.rect),
    x,
    y,
    snap,
  );
}

export type TapResult =
  | { readonly kind: 'select'; readonly source: number }
  | { readonly kind: 'move'; readonly source: number; readonly target: number }
  | { readonly kind: 'deselect' };

/**
 * Tap-tap mode. With a checker selected, a tap on (or near) one of its
 * targets moves it; that wins over picking another checker. Otherwise a tap
 * on a movable checker selects it; a second tap on it, or a tap elsewhere,
 * drops the selection.
 */
export function resolveTap(
  sources: readonly MovableSource[],
  selected: number | null,
  x: number,
  y: number,
  snap = SNAP_DISTANCE,
): TapResult {
  'worklet';
  const current = selected === null ? undefined : sources[selected];
  if (selected !== null && current !== undefined) {
    const exact = pickTarget(current, x, y, 0);
    if (exact >= 0) return { kind: 'move', source: selected, target: exact };
    const source = pickSource(sources, x, y, 0);
    if (source >= 0) return source === selected ? { kind: 'deselect' } : { kind: 'select', source };
    const near = pickTarget(current, x, y, snap);
    if (near >= 0) return { kind: 'move', source: selected, target: near };
    return { kind: 'deselect' };
  }
  const source = pickSource(sources, x, y, snap);
  return source >= 0 ? { kind: 'select', source } : { kind: 'deselect' };
}

export type DropResult =
  | { readonly kind: 'move'; readonly target: number }
  /** Dropped back where it came from. */
  | { readonly kind: 'cancel' }
  /** Dropped somewhere it may not go: it flies back, with a warning haptic. */
  | { readonly kind: 'illegal' };

/** Drag and drop: where a checker dragged from `source` and let go at (x, y) goes. */
export function resolveDrop(
  sources: readonly MovableSource[],
  source: number,
  x: number,
  y: number,
  snap = SNAP_DISTANCE,
): DropResult {
  'worklet';
  const from = sources[source];
  if (from === undefined) return { kind: 'cancel' };
  if (pickRect([from.rect], x, y, 0) === 0) return { kind: 'cancel' };
  const target = pickTarget(from, x, y, snap);
  return target >= 0 ? { kind: 'move', target } : { kind: 'illegal' };
}

/** What the end of the board's pan means. */
export type PanEnd = 'drop' | 'cancel' | 'none';

/**
 * The pan ended. `dragging`: it activated on a movable checker. `canceled`:
 * the gesture failed, or the system took the touch away.
 *
 * - A drag that ends normally is a drop.
 * - A drag the system cancels (a call, the app goes to the background)
 *   flies back, with no move.
 * - A pan that never dragged means nothing. The finger stayed put (the tap
 *   gesture handles that), or it did not start on a movable checker.
 */
export function panEnd(dragging: boolean, canceled: boolean): PanEnd {
  'worklet';
  if (!dragging) return 'none';
  return canceled ? 'cancel' : 'drop';
}

/**
 * Where the dragged checker is drawn: it moves as far as the finger moved
 * since touch down, so it does not jump to the finger.
 */
export function dragPoint(
  checker: ScreenPoint,
  start: ScreenPoint,
  finger: ScreenPoint,
): ScreenPoint {
  'worklet';
  return { x: checker.x + finger.x - start.x, y: checker.y + finger.y - start.y };
}
