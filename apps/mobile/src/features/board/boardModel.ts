/**
 * From engine state to what the board draws.
 *
 * The engine stores points in White's numbering ("absolute"). The theme
 * layout numbers points from the view of the player at the bottom of the
 * screen (the "viewer"). So the viewer always moves 24 -> 1, with home at
 * the bottom left (portrait layout). Turning the board to the other player
 * (pass-and-play "flip") is only a change of viewer.
 *
 * Checker colors stay with the player: White uses the theme's light style,
 * Black the dark style, whoever sits at the bottom.
 *
 * Pure TypeScript: no React, no Skia.
 */
import {
  POINTS_ON_BOARD,
  absoluteToOwn,
  ownToAbsolute,
  type BoardState,
  type Destination,
  type Direction,
  type Origin,
  type PlayerId,
} from '@tavli/engine';

import {
  stackGeometry,
  slotKey,
  trayGeometry,
  type BoardGeometry,
  type BoardSide,
  type ScreenRect,
  type Slot,
} from './geometry';

/** Who sits at the bottom of the screen, and how the game numbers points. */
export interface BoardView {
  readonly viewer: PlayerId;
  readonly direction: Direction;
}

/** The theme checker style of a player. */
export type CheckerTone = 'light' | 'dark';

export function toneOf(player: PlayerId): CheckerTone {
  return player === 'white' ? 'light' : 'dark';
}

/** The bar half and tray side of a player in this view. */
export function sideOf(player: PlayerId, view: BoardView): BoardSide {
  return player === view.viewer ? 'player' : 'opponent';
}

/** Layout index (1..24) of an absolute engine point. */
export function layoutIndexOf(absolute: number, view: BoardView): number {
  return absoluteToOwn(absolute, view.viewer, view.direction);
}

/** Absolute engine point of a layout index. */
export function absoluteOfLayout(index: number, view: BoardView): number {
  return ownToAbsolute(index, view.viewer, view.direction);
}

/** The slot of a move origin. Point numbers are the mover's own numbers. */
export function slotOfOrigin(origin: Origin, mover: PlayerId, view: BoardView): Slot {
  // 'outside' (Asodio, not built yet) waits on the bar too, for now.
  if (origin === 'bar' || origin === 'outside') return { kind: 'bar', side: sideOf(mover, view) };
  const absolute = ownToAbsolute(origin, mover, view.direction);
  return { kind: 'point', index: layoutIndexOf(absolute, view) };
}

/** The slot of a move destination. Point numbers are the mover's own numbers. */
export function slotOfDestination(
  destination: Destination,
  mover: PlayerId,
  view: BoardView,
): Slot {
  if (destination === 'off') return { kind: 'tray', side: sideOf(mover, view) };
  const absolute = ownToAbsolute(destination, mover, view.direction);
  return { kind: 'point', index: layoutIndexOf(absolute, view) };
}

/** One stack of round checkers. `owners` runs from the base outwards. */
export interface StackModel {
  readonly slot: Slot;
  readonly owners: readonly PlayerId[];
}

/** Every non-empty point and bar half of a board, in this view. */
export function boardStacks(board: BoardState, view: BoardView): StackModel[] {
  const stacks: StackModel[] = [];
  for (let absolute = 1; absolute <= POINTS_ON_BOARD; absolute++) {
    const point = board.points[absolute - 1];
    if (point === undefined) continue;
    const total = point.white + point.black;
    if (total === 0) continue;
    // A pinned checker (Plakoto) lies under the checker that pins it.
    const first: PlayerId = point.pinned ?? (point.white > 0 ? 'white' : 'black');
    const second: PlayerId = first === 'white' ? 'black' : 'white';
    const owners = [
      ...Array<PlayerId>(point[first]).fill(first),
      ...Array<PlayerId>(point[second]).fill(second),
    ];
    stacks.push({ slot: { kind: 'point', index: layoutIndexOf(absolute, view) }, owners });
  }
  for (const player of ['white', 'black'] as const) {
    const count = board.bar[player] + board.outside[player];
    if (count > 0) {
      stacks.push({
        slot: { kind: 'bar', side: sideOf(player, view) },
        owners: Array<PlayerId>(count).fill(player),
      });
    }
  }
  return stacks;
}

/** How many checkers sit in a slot now. */
export function countIn(board: BoardState, slot: Slot, view: BoardView): number {
  switch (slot.kind) {
    case 'point': {
      const point = board.points[absoluteOfLayout(slot.index, view) - 1];
      return point === undefined ? 0 : point.white + point.black;
    }
    case 'bar': {
      const player = slot.side === 'player' ? view.viewer : other(view.viewer);
      return board.bar[player] + board.outside[player];
    }
    case 'tray': {
      const player = slot.side === 'player' ? view.viewer : other(view.viewer);
      return board.off[player];
    }
  }
}

function other(player: PlayerId): PlayerId {
  return player === 'white' ? 'black' : 'white';
}

// ---------------------------------------------------------------------------
// The picture: every checker with its place in points.

/** One round checker to draw. `key` is `<slot>:<n>`, n = 0 at the base. */
export interface PlacedChecker {
  readonly key: string;
  readonly owner: PlayerId;
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** A count badge on the last visible checker of a tall stack. */
export interface PlacedBadge {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  /** Radius of the checker it sits on. */
  readonly r: number;
  readonly count: number;
}

/** Borne-off checkers of one player. */
export interface PlacedTray {
  readonly key: string;
  readonly owner: PlayerId;
  readonly side: BoardSide;
  readonly rects: readonly ScreenRect[];
}

export interface BoardPicture {
  readonly checkers: readonly PlacedChecker[];
  readonly badges: readonly PlacedBadge[];
  readonly trays: readonly PlacedTray[];
}

/** Places every checker of `board` on the drawn board. */
export function layoutBoard(geo: BoardGeometry, board: BoardState, view: BoardView): BoardPicture {
  const checkers: PlacedChecker[] = [];
  const badges: PlacedBadge[] = [];
  for (const stack of boardStacks(board, view)) {
    const key = slotKey(stack.slot);
    const { centers, radius, badge } = stackGeometry(geo, stack.slot, stack.owners.length);
    centers.forEach((c, n) => {
      const owner = stack.owners[n] ?? stack.owners[0] ?? 'white';
      checkers.push({ key: `${key}:${n}`, owner, x: c.x, y: c.y, r: radius });
    });
    const last = centers[centers.length - 1];
    if (badge !== null && last !== undefined) {
      badges.push({ key, x: last.x, y: last.y, r: radius, count: badge });
    }
  }
  const trays: PlacedTray[] = [];
  for (const owner of ['white', 'black'] as const) {
    const count = board.off[owner];
    if (count === 0) continue;
    const side = sideOf(owner, view);
    trays.push({ key: `tray:${side}`, owner, side, rects: trayGeometry(geo, side, count) });
  }
  return { checkers, badges, trays };
}

/** The key of the top checker of a slot with `count` checkers, as `layoutBoard` names it. */
export function topCheckerKey(geo: BoardGeometry, slot: Slot, count: number): string | null {
  if (slot.kind === 'tray' || count === 0) return null;
  const visible = Math.min(count, geo.layout.checker.maxVisible);
  return `${slotKey(slot)}:${visible - 1}`;
}
