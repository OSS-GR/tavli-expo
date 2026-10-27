/**
 * A slow, simple Asodio rules model, used only in tests. Not exported from
 * the package. It does not share code with the variant, so tests can check
 * the variant against it (like `plakoto-oracle.ts` for Plakoto).
 *
 * It follows `docs/rules/asodio.md` word for word, one die at a time:
 *
 * - the whole roll: the first-entry gate (all 15 outside, only a 1-2 or a
 *   double) and `barEntryNeedsSpecial` (a hit checker waits for a 1-2 or a
 *   double);
 * - hit checkers enter first; a die `d` enters on own point `25 - d`;
 * - a pinned checker does not move;
 * - while a checker is outside: no moves on the board without
 *   `moveWhileLoading`, and never out of the starting quarter with
 *   `mustEnterAllFirst`;
 * - `quarterLock`: only checkers in the same quarter as the last checker
 *   may move (or, with `moveInsideFrozenQuarter`, the others inside their
 *   own quarter);
 * - land on an empty point, our own checkers, our own pin, or one free
 *   opponent checker (pin or hit);
 * - bear off when nothing is outside or on the bar, all 15 are home, and
 *   (pins, unless `bearOffWhilePinned`) none is pinned.
 *
 * `referenceFinals` tries every order of the dice and every checker, with
 * no pruning.
 */

import type { BoardState } from '../board';
import type { Dice, DieValue } from '../dice';
import type { Move } from '../move';
import { opponent } from '../player';
import type { PlayerId } from '../player';
import type { RuleSet } from '../rules';
import type { GameState } from '../state';

export const NO_PIN = 0;
export const WE_ARE_PINNED = 1;
export const WE_PIN = 2;

export type From = number | 'bar' | 'outside';

/** One player's view of the board, in their own numbering. */
export interface Side {
  /** 0 = off, 1–24 own points. */
  readonly own: number[];
  /** Opponent checkers on own points 1–24. */
  readonly opp: number[];
  /** The pin on own points 1–24. */
  readonly pin: number[];
  bar: number;
  outside: number;
  /** Opponent checkers we hit to the bar. */
  oppBar: number;
}

export function sideOf(board: BoardState, player: PlayerId): Side {
  const other = opponent(player);
  const own = new Array<number>(25).fill(0);
  const opp = new Array<number>(25).fill(0);
  const pin = new Array<number>(25).fill(NO_PIN);
  for (let i = 0; i < 24; i += 1) {
    const point = board.points[i];
    if (point === undefined) continue;
    const p = player === 'white' ? i + 1 : 24 - i;
    own[p] = point[player];
    opp[p] = point[other];
    if (point.pinned !== null) pin[p] = point.pinned === player ? WE_ARE_PINNED : WE_PIN;
  }
  own[0] = board.off[player];
  return {
    own,
    opp,
    pin,
    bar: board.bar[player],
    outside: board.outside[player],
    oppBar: board.bar[other],
  };
}

export function sideKey(side: Side): string {
  return [
    side.own.join(','),
    side.opp.join(','),
    side.pin.join(','),
    side.bar,
    side.outside,
    side.oppBar,
  ].join('|');
}

export function copySide(side: Side): Side {
  return { ...side, own: [...side.own], opp: [...side.opp], pin: [...side.pin] };
}

/** 1 = own 19–24 (the starting quarter), 2 = 13–18, 3 = 7–12, 4 = 1–6 (home). */
function quarter(p: number): number {
  if (p >= 19) return 1;
  if (p >= 13) return 2;
  if (p >= 7) return 3;
  return 4;
}

function isSpecial(dice: Dice): boolean {
  return dice[0] === dice[1] || (Math.min(...dice) === 1 && Math.max(...dice) === 2);
}

/** True when the roll cannot move anything, whatever the board. */
export function rollStopped(side: Side, dice: Dice, rules: RuleSet): boolean {
  const { firstEntryGate, firstEntryGateRolls, barEntryNeedsSpecial } = rules.entry;
  if (firstEntryGate && side.outside === 15) {
    const opens = firstEntryGateRolls === 'doubleOnly' ? dice[0] === dice[1] : isSpecial(dice);
    if (!opens) return true;
  }
  return barEntryNeedsSpecial && side.bar > 0 && !isSpecial(dice);
}

function landingOk(side: Side, to: number, rules: RuleSet): boolean {
  const theirs = side.opp[to] ?? 0;
  if (rules.capture.captureMode === 'hit') return theirs <= 1;
  return theirs === 0 || side.pin[to] === WE_PIN || (theirs === 1 && side.pin[to] === NO_PIN);
}

/** True when one checker may move from `from` with `die` (the roll gates aside). */
export function canStep(side: Side, from: From, die: number, rules: RuleSet): boolean {
  if (side.bar > 0 && from !== 'bar') return false;
  if (from === 'bar' || from === 'outside') {
    if ((from === 'bar' ? side.bar : side.outside) === 0) return false;
    return landingOk(side, 25 - die, rules);
  }
  const { own, pin } = side;
  if ((own[from] ?? 0) === 0 || pin[from] === WE_ARE_PINNED) return false;
  const to = from - die;
  if (side.outside > 0) {
    if (!rules.entry.moveWhileLoading) return false;
    if (rules.entry.mustEnterAllFirst && quarter(Math.max(to, 1)) !== 1) return false;
  }
  if (rules.quarters.quarterLock) {
    let last = 0;
    for (let p = 1; p <= 24; p += 1) if ((own[p] ?? 0) > 0) last = p;
    const lastQuarter = side.bar > 0 || side.outside > 0 ? 1 : quarter(last);
    if (quarter(from) !== lastQuarter) {
      if (!rules.quarters.moveInsideFrozenQuarter) return false;
      if (to < 1 || quarter(to) !== quarter(from)) return false;
    }
  }
  if (to >= 1) return landingOk(side, to, rules);
  if (side.bar > 0 || side.outside > 0) return false;
  for (let p = 7; p <= 24; p += 1) if ((own[p] ?? 0) > 0) return false;
  if (rules.capture.captureMode === 'pin' && !rules.bearOff.bearOffWhilePinned) {
    for (let p = 1; p <= 6; p += 1) if (pin[p] === WE_ARE_PINNED) return false;
  }
  if (to === 0) return true;
  if (rules.bearOff.exactBearOff) return false;
  for (let p = from + 1; p <= 6; p += 1) if ((own[p] ?? 0) > 0) return false;
  return true;
}

/** The move `canStep` allows, in engine form. */
export function stepMove(side: Side, from: From, die: DieValue, rules: RuleSet): Move {
  const to = typeof from === 'number' ? from - die : 25 - die;
  const lone = to >= 1 && side.opp[to] === 1 && side.pin[to] === NO_PIN;
  const capture = !lone ? 'none' : rules.capture.captureMode === 'hit' ? 'hit' : 'pin';
  return { from, to: to < 1 ? 'off' : to, die, capture };
}

/** Plays one checker that `canStep` allows. Changes `side` in place. */
export function playStep(side: Side, from: From, die: number, rules: RuleSet): void {
  const { own, opp, pin } = side;
  let to: number;
  if (from === 'bar') {
    side.bar -= 1;
    to = 25 - die;
  } else if (from === 'outside') {
    side.outside -= 1;
    to = 25 - die;
  } else {
    own[from] = (own[from] ?? 0) - 1;
    if (own[from] === 0 && pin[from] === WE_PIN) pin[from] = NO_PIN;
    to = Math.max(from - die, 0);
  }
  if (to > 0 && opp[to] === 1 && pin[to] === NO_PIN) {
    if (rules.capture.captureMode === 'hit') {
      opp[to] = 0;
      side.oppBar += 1;
    } else {
      pin[to] = WE_PIN;
    }
  }
  own[to] = (own[to] ?? 0) + 1;
}

export const ORIGINS: readonly From[] = [
  'bar',
  'outside',
  ...Array.from({ length: 24 }, (_, i) => 24 - i),
];

/** True when the side has a single move with some die (so some roll moves). */
export function anyStep(side: Side, rules: RuleSet): boolean {
  for (let die = 1; die <= 6; die += 1) {
    for (const from of ORIGINS) if (canStep(side, from, die, rules)) return true;
  }
  return false;
}

/**
 * End positions (`sideKey`) of all legal plays, by the book: every order,
 * every checker; the plays that use the most dice; the higher-die rule.
 */
export function referenceFinals(state: GameState, dice: Dice): Set<string> {
  const { rules } = state;
  const start = sideOf(state.board, state.toMove);
  if (rollStopped(start, dice, rules)) return new Set([sideKey(start)]);
  const [a, b] = dice;
  const orders: DieValue[][] =
    a === b
      ? [[a, a, a, a]]
      : [
          [a, b],
          [b, a],
        ];
  const plays: { side: Side; dice: DieValue[] }[] = [];
  const walk = (side: Side, order: DieValue[], used: DieValue[]): void => {
    const die = order[used.length];
    let moved = false;
    if (die !== undefined) {
      for (const from of ORIGINS) {
        if (!canStep(side, from, die, rules)) continue;
        const next = copySide(side);
        playStep(next, from, die, rules);
        moved = true;
        walk(next, order, [...used, die]);
      }
    }
    if (!moved) plays.push({ side, dice: used });
  };
  for (const order of orders) walk(start, order, []);
  const most = Math.max(...plays.map((p) => p.dice.length));
  let best = plays.filter((p) => p.dice.length === most);
  const high = Math.max(a, b);
  if (most === 1 && a !== b && rules.movement.higherDieRule) {
    if (best.some((p) => p.dice[0] === high)) best = best.filter((p) => p.dice[0] === high);
  }
  return new Set(best.map((p) => sideKey(p.side)));
}
