/**
 * A slow, simple Plakoto rules model, used only in tests. Not exported from
 * the package. It does not share code with the variant, so tests can check
 * the variant against it (like `portes-oracle.ts` for Portes).
 *
 * It follows `docs/rules/plakoto.md` and the engine algorithm in
 * `tavli-match.md` word for word: one die at a time; land on an empty
 * point, on our own checkers, or on one free opponent checker (which we
 * pin); a pinned checker does not move; bear off only when all 15 are home
 * and none is pinned. `referenceFinals` tries every order of the dice and
 * every checker, with no pruning, and then cuts each play at the move that
 * ends the game by the mother rule (`motherCheckTiming: "afterEachMove"`).
 */

import type { BoardState } from '../board';
import type { Dice, DieValue } from '../dice';
import type { Move } from '../move';
import { opponent } from '../player';
import type { PlayerId } from '../player';
import type { RuleSet } from '../rules';
import type { GameState } from '../state';

/** No pin / our lone checker is pinned / we pin their lone checker. */
export const NO_PIN = 0;
export const WE_ARE_PINNED = 1;
export const WE_PIN = 2;

/** One player's view of the board, in their own numbering. */
export interface Side {
  /** 0 = off, 1–24 own points. */
  readonly own: number[];
  /** Opponent checkers on own points 1–24. */
  readonly opp: number[];
  /** The pin on own points 1–24: `NO_PIN`, `WE_ARE_PINNED` or `WE_PIN`. */
  readonly pin: number[];
  /** Own points where we pinned a checker this turn (`intermediatePinBlocks`). */
  readonly pinnedNow: boolean[];
}

/** The board seen by `player`. */
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
  return { own, opp, pin, pinnedNow: new Array<boolean>(25).fill(false) };
}

/** A string that is equal for equal sides (the pins of this turn do not count). */
export function sideKey(side: Side): string {
  return `${side.own.join(',')}|${side.opp.join(',')}|${side.pin.join(',')}`;
}

/** A copy that `playStep` can change. */
export function copySide(side: Side): Side {
  return {
    own: [...side.own],
    opp: [...side.opp],
    pin: [...side.pin],
    pinnedNow: [...side.pinnedNow],
  };
}

/** True when one checker may move from own point `from` with `die`. */
export function canStep(side: Side, from: number, die: number, rules: RuleSet): boolean {
  const { own, opp, pin } = side;
  if ((own[from] ?? 0) === 0) return false;
  // Movement rule 5: a pinned checker cannot move.
  if (pin[from] === WE_ARE_PINNED) return false;
  // intermediatePinBlocks (edge case 9): no combined move through a pin made this turn.
  if (rules.capture.intermediatePinBlocks && side.pinnedNow[from] === true && own[from] === 1) {
    return false;
  }
  const to = from - die;
  if (to >= 1) {
    // Movement rules 2 and 3: empty, our checkers on top, or one free opponent checker.
    const theirs = opp[to] ?? 0;
    return theirs === 0 || pin[to] === WE_PIN || (theirs === 1 && pin[to] === NO_PIN);
  }
  // Bearing off: all 15 home, and (plakoto.md "Bearing off") none pinned.
  for (let p = 7; p <= 24; p += 1) if ((own[p] ?? 0) > 0) return false;
  if (!rules.bearOff.bearOffWhilePinned) {
    for (let p = 1; p <= 6; p += 1) if (pin[p] === WE_ARE_PINNED) return false;
  }
  // A larger die bears off only the highest checker.
  if (to < 0) for (let p = from + 1; p <= 6; p += 1) if ((own[p] ?? 0) > 0) return false;
  return true;
}

/** The move `canStep` allows, in engine form. */
export function stepMove(side: Side, from: number, die: DieValue): Move {
  const to = from - die;
  const pins = to >= 1 && side.opp[to] === 1 && side.pin[to] === NO_PIN;
  return { from, to: to < 1 ? 'off' : to, die, capture: pins ? 'pin' : 'none' };
}

/** Plays one checker that `canStep` allows. Changes `side` in place. */
export function playStep(side: Side, from: number, die: number): void {
  const { own, opp, pin } = side;
  own[from] = (own[from] ?? 0) - 1;
  // Movement rule 6: the last pinner leaves, the pinned checker is free.
  if (own[from] === 0 && pin[from] === WE_PIN) pin[from] = NO_PIN;
  const to = Math.max(from - die, 0);
  if (to > 0 && opp[to] === 1 && pin[to] === NO_PIN) {
    // Pinning rule 1.
    pin[to] = WE_PIN;
    side.pinnedNow[to] = true;
  }
  own[to] = (own[to] ?? 0) + 1;
}

/** Plays one checker from `from` with `die`, or returns `null` if that is not legal. */
export function step(side: Side, from: number, die: number, rules: RuleSet): Side | null {
  if (!canStep(side, from, die, rules)) return null;
  const next = copySide(side);
  playStep(next, from, die);
  return next;
}

/**
 * True when the mover's last move ended the game by the mother rule, with
 * `motherCheckTiming: "afterEachMove"`. The opponent's mother sits on the
 * mover's own point 1; the mover's mother on own point 24.
 */
export function endsMidTurn(side: Side, rules: RuleSet): boolean {
  const { motherRule, motherCheckTiming } = rules.mother;
  if (motherCheckTiming !== 'afterEachMove') return false;
  const theirMotherPinned = side.pin[1] === WE_PIN;
  const ourMotherPinned = side.pin[24] === WE_ARE_PINNED;
  if (!theirMotherPinned) return false;
  switch (motherRule) {
    case 'instant':
      return true; // edge case 20
    case 'federation':
      // Rule 1 (we have nothing left on own 24) or rule 3 (both pinned: a draw).
      return side.own[24] === 0 || ourMotherPinned;
    case 'offerConcede':
      return ourMotherPinned; // both pinned: a draw
    case 'none':
      return false;
  }
}

/**
 * End positions (`sideKey`) of all legal plays, by the book: every order,
 * every checker; the plays that use the most dice; the higher-die rule;
 * then each play cut at the move that ends the game.
 */
export function referenceFinals(state: GameState, dice: Dice): Set<string> {
  const { rules } = state;
  const [a, b] = dice;
  const orders: DieValue[][] =
    a === b
      ? [[a, a, a, a]]
      : [
          [a, b],
          [b, a],
        ];
  const plays: { sides: Side[]; dice: DieValue[] }[] = [];
  const walk = (sides: Side[], order: DieValue[], used: DieValue[]): void => {
    const die = order[used.length];
    const side = sides[sides.length - 1] as Side;
    let moved = false;
    if (die !== undefined) {
      for (let from = 24; from >= 1; from -= 1) {
        const next = step(side, from, die, rules);
        if (next === null) continue;
        moved = true;
        walk([...sides, next], order, [...used, die]);
      }
    }
    if (!moved) plays.push({ sides, dice: used });
  };
  for (const order of orders) walk([sideOf(state.board, state.toMove)], order, []);
  const most = Math.max(...plays.map((p) => p.dice.length));
  let best = plays.filter((p) => p.dice.length === most);
  const high = Math.max(a, b);
  if (most === 1 && a !== b && rules.movement.higherDieRule) {
    if (best.some((p) => p.dice[0] === high)) best = best.filter((p) => p.dice[0] === high);
  }
  const finals = new Set<string>();
  for (const { sides } of best) {
    const end = sides.findIndex((s, i) => i > 0 && endsMidTurn(s, rules));
    finals.add(sideKey((end < 0 ? sides[sides.length - 1] : sides[end]) as Side));
  }
  return finals;
}
