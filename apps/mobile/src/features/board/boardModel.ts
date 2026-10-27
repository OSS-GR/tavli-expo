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
 * Every game draws the same way. The direction of the game (`contrary` for
 * Portes, Plakoto and Asodio, `parallel` for Fevga) only changes where each
 * player's points are. Plakoto and Asodio add pinned checkers: a pinned
 * checker lies under the stack that pins it and peeks out (`PIN_PEEK`).
 * Plakoto and Fevga never use the bar. Asodio (owner version) has no hits:
 * its checkers that are not entered yet wait on the player's half of the
 * bar, the "to enter" stack, right next to the starting quarter, with a
 * count badge. Checkers frozen by the quarter lock are marked (`frozen`).
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
  pinnedCenter,
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
  // 'outside' is Asodio only: the "to enter" stack on the player's bar half.
  // Only Portes hits; the owner's Asodio pins, so its bar holds only these.
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
  /** Plakoto, Asodio: the owner of the pinned checker under the stack, or `null`. */
  readonly pinned: PlayerId | null;
  /** Asodio: a bar half that holds checkers not entered yet (the "to enter" stack). */
  readonly toEnter: boolean;
}

/** Every non-empty point and bar half of a board, in this view. */
export function boardStacks(board: BoardState, view: BoardView): StackModel[] {
  const stacks: StackModel[] = [];
  for (let absolute = 1; absolute <= POINTS_ON_BOARD; absolute++) {
    const point = board.points[absolute - 1];
    if (point === undefined) continue;
    const total = point.white + point.black;
    if (total === 0) continue;
    const slot: Slot = { kind: 'point', index: layoutIndexOf(absolute, view) };
    // A pinned checker (Plakoto) lies under the checkers that pin it. It is
    // not part of the stack: the stack starts on top of it.
    const pinned = point.pinned;
    if (pinned !== null) {
      const pinner = other(pinned);
      stacks.push({
        slot,
        owners: Array<PlayerId>(point[pinner]).fill(pinner),
        pinned,
        toEnter: false,
      });
      continue;
    }
    const owner: PlayerId = point.white > 0 ? 'white' : 'black';
    stacks.push({
      slot,
      owners: Array<PlayerId>(total).fill(owner),
      pinned: null,
      toEnter: false,
    });
  }
  for (const player of ['white', 'black'] as const) {
    const count = board.bar[player] + board.outside[player];
    if (count > 0) {
      stacks.push({
        slot: { kind: 'bar', side: sideOf(player, view) },
        owners: Array<PlayerId>(count).fill(player),
        pinned: null,
        toEnter: board.outside[player] > 0,
      });
    }
  }
  return stacks;
}

/**
 * How many checkers sit in the stack of a slot now. A pinned checker
 * (Plakoto) lies under the stack and does not count: see `pinnedIn`.
 */
export function countIn(board: BoardState, slot: Slot, view: BoardView): number {
  switch (slot.kind) {
    case 'point': {
      const point = board.points[absoluteOfLayout(slot.index, view) - 1];
      if (point === undefined) return 0;
      return point.white + point.black - (point.pinned === null ? 0 : 1);
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

/** True when a pinned checker (Plakoto) lies under the stack of this slot. */
export function pinnedIn(board: BoardState, slot: Slot, view: BoardView): boolean {
  if (slot.kind !== 'point') return false;
  return (board.points[absoluteOfLayout(slot.index, view) - 1]?.pinned ?? null) !== null;
}

/** A pinned checker, in its owner's own numbering (for the screen reader). */
export interface PinnedChecker {
  readonly player: PlayerId;
  /** The owner's own point number (24 = start). */
  readonly point: number;
}

/** Every pinned checker of a board (Plakoto). Empty in Portes and Fevga. */
export function pinnedCheckers(board: BoardState, direction: Direction): PinnedChecker[] {
  const out: PinnedChecker[] = [];
  board.points.forEach((point, i) => {
    if (point.pinned === null) return;
    out.push({ player: point.pinned, point: absoluteToOwn(i + 1, point.pinned, direction) });
  });
  return out;
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
  /** Asodio: frozen by the quarter lock. Drawn a little dimmer. */
  readonly frozen?: true;
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

/**
 * A pinned checker (Plakoto). It is drawn under the stack that pins it,
 * with a ring, and peeks out on the base side. `key` is `<slot>:pinned`.
 */
export interface PlacedPin {
  readonly key: string;
  /** The owner of the pinned checker. */
  readonly owner: PlayerId;
  /** The owner of the checkers on top. */
  readonly pinner: PlayerId;
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** Borne-off checkers of one player. */
export interface PlacedTray {
  readonly key: string;
  readonly owner: PlayerId;
  readonly side: BoardSide;
  readonly rects: readonly ScreenRect[];
}

export interface BoardPicture {
  /** Pinned checkers. They are drawn before (under) the checkers. */
  readonly pins: readonly PlacedPin[];
  readonly checkers: readonly PlacedChecker[];
  readonly badges: readonly PlacedBadge[];
  readonly trays: readonly PlacedTray[];
}

/** Extra marks on the picture. */
export interface BoardMarks {
  /** Asodio: slots (`slotKey`) whose checkers the quarter lock freezes. */
  readonly frozen?: ReadonlySet<string>;
}

/**
 * The layout slot keys of the points with frozen checkers (Asodio quarter
 * lock), for both players. `frozen` lists each player's own point numbers
 * (from `frozenPoints` in `asodio.ts`).
 */
export function frozenSlotKeys(
  frozen: { readonly [P in PlayerId]: readonly number[] },
  view: BoardView,
): Set<string> {
  const keys = new Set<string>();
  for (const player of ['white', 'black'] as const) {
    for (const point of frozen[player]) {
      const slot = slotOfOrigin(point, player, view);
      keys.add(slotKey(slot));
    }
  }
  return keys;
}

/**
 * Places every checker of `board` on the drawn board. A "to enter" stack
 * (Asodio) always shows its count badge, even when every checker is drawn.
 */
export function layoutBoard(
  geo: BoardGeometry,
  board: BoardState,
  view: BoardView,
  marks: BoardMarks = {},
): BoardPicture {
  const pins: PlacedPin[] = [];
  const checkers: PlacedChecker[] = [];
  const badges: PlacedBadge[] = [];
  for (const stack of boardStacks(board, view)) {
    const key = slotKey(stack.slot);
    const pinned = stack.pinned;
    const { centers, radius, badge } = stackGeometry(
      geo,
      stack.slot,
      stack.owners.length,
      pinned !== null,
    );
    if (pinned !== null) {
      const c = pinnedCenter(geo, stack.slot);
      pins.push({ key: `${key}:pinned`, owner: pinned, pinner: other(pinned), ...c, r: radius });
    }
    const frozen = marks.frozen?.has(key) === true;
    centers.forEach((c, n) => {
      const owner = stack.owners[n] ?? stack.owners[0] ?? 'white';
      checkers.push({
        key: `${key}:${n}`,
        owner,
        x: c.x,
        y: c.y,
        r: radius,
        ...(frozen ? { frozen: true as const } : {}),
      });
    });
    const last = centers[centers.length - 1];
    const shown = stack.toEnter ? stack.owners.length : badge;
    if (shown !== null && last !== undefined) {
      badges.push({ key, x: last.x, y: last.y, r: radius, count: shown });
    }
  }
  const trays: PlacedTray[] = [];
  for (const owner of ['white', 'black'] as const) {
    const count = board.off[owner];
    if (count === 0) continue;
    const side = sideOf(owner, view);
    trays.push({ key: `tray:${side}`, owner, side, rects: trayGeometry(geo, side, count) });
  }
  return { pins, checkers, badges, trays };
}

/**
 * The key of the top checker of a slot with `count` checkers in its stack,
 * as `layoutBoard` names it. A pinned checker under the stack has its own
 * key (`<slot>:pinned`) and never moves.
 */
export function topCheckerKey(geo: BoardGeometry, slot: Slot, count: number): string | null {
  if (slot.kind === 'tray' || count === 0) return null;
  const visible = Math.min(count, geo.layout.checker.maxVisible);
  return `${slotKey(slot)}:${visible - 1}`;
}
