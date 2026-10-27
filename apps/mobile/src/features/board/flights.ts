/**
 * Checkers in the air: a move, a hit and an undo as short flights from one
 * place to another. Pure TypeScript; `FlightChecker` animates them.
 *
 * A pin (Plakoto) is a plain move: the pinned checker stays where it is and
 * the pinner lands on top. Only a hit (Portes) sends a checker to the bar.
 *
 * While a checker flies, the checker at its landing place is hidden, so the
 * player sees one checker travel, not one that jumps and one that flies.
 */
import type { BoardState, Move, PlayerId } from '@tavli/engine';

import {
  countIn,
  pinnedIn,
  slotOfDestination,
  slotOfOrigin,
  topCheckerKey,
  type BoardView,
} from './boardModel';
import { stackGeometry, type BoardGeometry, type ScreenPoint, type Slot } from './geometry';
import { slotTop } from './interaction';

/** Flight time of a moved checker, in ms. */
export const FLIGHT_MS = 200;
/** A hit checker leaves a moment after the hitter lands. */
export const HIT_DELAY_MS = 120;

export interface Flight {
  readonly id: string;
  readonly owner: PlayerId;
  readonly from: ScreenPoint;
  readonly to: ScreenPoint;
  /** Radius at the start and at the end (bar checkers are smaller). */
  readonly fromR: number;
  readonly toR: number;
  /** The checker (a `layoutBoard` key) to hide until this flight lands. */
  readonly hide: string | null;
  readonly delay: number;
}

/** The key of the top checker of a slot, if it is a drawn checker that only this flight brings. */
function hideKey(geo: BoardGeometry, slot: Slot, count: number): string | null {
  if (count > geo.layout.checker.maxVisible) return null;
  return topCheckerKey(geo, slot, count);
}

/** The checker of a blot that is hit: the first checker of the point. */
function blotOf(geo: BoardGeometry, slot: Slot) {
  const { centers, radius } = stackGeometry(geo, slot, 1);
  const c = centers[0];
  return c ? { x: c.x, y: c.y, r: radius } : null;
}

export interface MoveFlightOptions {
  /** Id prefix; each flight gets `<id>:<n>`. */
  readonly id: string;
  /** Start of the moved checker (a drop point). Default: its place on `before`. */
  readonly from?: ScreenPoint;
  /** `true` when `move` is taken back: `before` has it played, `after` does not. */
  readonly undo?: boolean;
}

/**
 * The flights that show `move` (or its undo) on screen: the moved checker,
 * plus the hit checker going to (or coming back from) the bar.
 */
export function moveFlights(
  geo: BoardGeometry,
  view: BoardView,
  mover: PlayerId,
  move: Move,
  before: BoardState,
  after: BoardState,
  options: MoveFlightOptions,
): Flight[] {
  const undo = options.undo === true;
  const origin = slotOfOrigin(move.from, mover, view);
  const destination = slotOfDestination(move.to, mover, view);
  // An undo flies the checker back: from the destination to the origin.
  const start = undo ? destination : origin;
  const end = undo ? origin : destination;
  // A pinned checker (Plakoto) under a stack moves the stack along a little.
  const from = slotTop(geo, start, countIn(before, start, view), pinnedIn(before, start, view));
  const endCount = countIn(after, end, view);
  const to = slotTop(geo, end, endCount, pinnedIn(after, end, view));
  const flights: Flight[] = [];
  if (from && to) {
    flights.push({
      id: `${options.id}:0`,
      owner: mover,
      from: options.from ?? from,
      to,
      fromR: from.r,
      toR: to.r,
      hide: hideKey(geo, end, endCount),
      delay: 0,
    });
  }
  if (move.capture === 'hit' && destination.kind === 'point') {
    const victim: PlayerId = mover === 'white' ? 'black' : 'white';
    const bar = slotOfOrigin('bar', victim, view);
    const blot = blotOf(geo, destination);
    if (undo) {
      // The hit checker comes back from the bar to its point.
      const fromBar = slotTop(geo, bar, countIn(before, bar, view));
      if (fromBar && blot) {
        flights.push({
          id: `${options.id}:1`,
          owner: victim,
          from: fromBar,
          to: blot,
          fromR: fromBar.r,
          toR: blot.r,
          hide: hideKey(geo, destination, 1),
          delay: 0,
        });
      }
    } else {
      const barCount = countIn(after, bar, view);
      const toBar = slotTop(geo, bar, barCount);
      if (toBar && blot) {
        flights.push({
          id: `${options.id}:1`,
          owner: victim,
          from: blot,
          to: toBar,
          fromR: blot.r,
          toR: toBar.r,
          hide: hideKey(geo, bar, barCount),
          delay: HIT_DELAY_MS,
        });
      }
    }
  }
  return flights;
}
