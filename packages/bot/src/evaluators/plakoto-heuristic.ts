/**
 * `plakoto-heuristic-v1`: a hand-tuned evaluator for Plakoto
 * (docs/architecture/bot-ai.md, section 4.2; rules in `docs/rules/plakoto.md`).
 *
 * It scores a position before the roll, from the view of the player to roll
 * (the "roller"). The other player is the "waiter". It works like the Portes
 * heuristic (`portes-heuristic.ts`):
 *
 * - **Contact** (a pin is still possible, or a checker is pinned): a
 *   weighted sum of features gives a score in logits, `win = sigmoid(score)`.
 *   The features are pins held and suffered, the mother (pinned or exposed),
 *   the race, made points (the home board counts most), the longest prime,
 *   and the lone checkers the other side can pin, with their shot counts.
 * - **No contact** (a pure race): the same race code as Portes (Keith count,
 *   Kleinman metric, the exact bear-off table). Plakoto bears off by the
 *   shared rules, so the numbers are the same.
 *
 * The mother (the last checker on own point 24) matters most. When it is
 * pinned, the pinned side almost always loses a double, whatever the mother
 * rule: with `offerConcede` it can resign for 2 points, or play on with a
 * checker that stays stuck. So a pinned mother costs `motherPinned` logits,
 * and most losses then count double (`motherDouble`).
 *
 * The evaluator reads only the board, not `state.variantData`: a pending
 * "resign or play on" question does not change the score, because playing
 * on is never worse than resigning (resigning loses 2 points, the most a
 * Plakoto game can lose).
 *
 * All weights are in one typed object, `PLAKOTO_DEFAULT_WEIGHTS`. Change
 * them with `createPlakotoHeuristic({ ...PLAKOTO_DEFAULT_WEIGHTS, pinBase: 0.5 })`.
 */

import type { GameState, MotherRules, Turn } from '@tavli/engine';
import { opponent } from '@tavli/engine';

import type { Evaluation, Evaluator, TurnScore } from '../types';
import { bearoffRolls, bearoffWinChance } from './bearoff';
import {
  OFF,
  PINNED,
  START,
  motherPinned,
  playPlakotoTurn,
  plakotoContact,
  plakotoSideOf,
} from './plakoto-board';
import type { PlakotoSide } from './plakoto-board';
import { countPlakotoShots, isPinnable } from './plakoto-shots';
import { pips } from './portes-board';
import { effectiveRacePips, kleinmanWinChance, raceDoubleChance } from './race';

/** The weights of the Plakoto heuristic. Scores are in logits (win = sigmoid(score)). */
export interface PlakotoWeights {
  /** How much the race counts while there is contact: × logit(Kleinman chance of the pip counts). */
  readonly race: number;
  /** A made point (2+ checkers) on own point 1–23: `madePoint × pointShape[point]`. */
  readonly madePoint: number;
  /** Relative value of a made point, index = own point 0–24 (0 and 24 unused). */
  readonly pointShape: readonly number[];
  /**
   * Home board: each made point on own 1–6 (or own pin there), per free
   * opponent checker still on those points (at most 3 count). They must
   * get out through the home board.
   */
  readonly homePointPerBack: number;
  /** The longest run of doors with free opponent checkers behind it: `prime × primeShape[length]`. */
  readonly prime: number;
  /** Relative value of a prime, index = length 0–6. */
  readonly primeShape: readonly number[];
  /** Each opponent checker we pin (not the mother): `pinBase + pinPips × its own point / 24 (+ pinHome)`. */
  readonly pinBase: number;
  /** The part of a pin's value that grows with how far the pinned checker is from home. */
  readonly pinPips: number;
  /** Extra for a pin held in our home (own 1–6): the pinner can stay there a long time. */
  readonly pinHome: number;
  /** Pinning the opponent's mother. */
  readonly motherPinned: number;
  /** The share of losses that are doubles when the loser's mother is pinned. */
  readonly motherDouble: number;
  /** Waiter's lone checkers: each costs `shots / 36 × blotShare × (value of pinning it)`. */
  readonly blotShare: number;
  /** Waiter's lone mother: costs `shots / 36 × motherShot`. */
  readonly motherShot: number;
  /** Extra cost of `any shot / 36`: the chance the roller pins at least one checker. */
  readonly anyShot: number;
  /** Each roller lone checker that a free opponent checker 1–12 pips behind could pin later. */
  readonly rollerBlot: number;
  /** The roller's own lone mother, with a free opponent checker 1–12 pips behind it. */
  readonly rollerMother: number;
  /** Each checker borne off. */
  readonly borneOff: number;
  /** Each checker past the third on one point (stacked, out of play); the start point does not count. */
  readonly stack: number;
  /** Double estimate in contact: `double × pips the loser needs to come home / (winner pips + 20)`. */
  readonly double: number;
}

/**
 * The default weights. Hand-picked, then tuned by self-play: two rounds of
 * a coordinate search (medium vs medium, 1,000 paired games per candidate;
 * results in the README). The tuned weights beat the hand-picked ones by
 * 0.27 points per game.
 */
export const PLAKOTO_DEFAULT_WEIGHTS: PlakotoWeights = {
  race: 0.2,
  madePoint: 0.5,
  // Own point:   0  1     2     3     4     5     6     7     8     9     10    11    12
  pointShape: [
    0, 0.12, 0.2, 0.26, 0.3, 0.32, 0.3, 0.25, 0.2, 0.15, 0.12, 0.1, 0.08,
    // 13   14    15    16    17    18    19    20    21    22    23    24
    0.06, 0.06, 0.06, 0.06, 0.06, 0.06, 0.08, 0.08, 0.08, 0.08, 0.06, 0,
  ],
  homePointPerBack: 0.06,
  prime: 1,
  // Length:    0  1  2     3     4    5    6
  primeShape: [0, 0, 0.1, 0.25, 0.5, 0.9, 1.5],
  pinBase: 0.2,
  pinPips: 0.56,
  pinHome: 0.2,
  motherPinned: 4.5,
  motherDouble: 0.95,
  blotShare: 0.6,
  motherShot: 3,
  anyShot: 0.26,
  rollerBlot: 0.08,
  rollerMother: 0.5,
  borneOff: 0.04,
  stack: 0.05,
  double: 0.975,
};

export const PLAKOTO_HEURISTIC_ID = 'plakoto-heuristic-v1';

const EPS = 1e-6;

function logit(p: number): number {
  const q = Math.min(1 - EPS, Math.max(EPS, p));
  return Math.log(q / (1 - q));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function at(values: readonly number[], i: number): number {
  return values[i] ?? 0;
}

/** True when `me` holds own point `p` against `them`: 2+ checkers, or a pin of theirs. */
function isDoor(me: PlakotoSide, them: PlakotoSide, p: number): boolean {
  const n = at(me, p);
  return n >= 2 || (n === 1 && at(them, PINNED + 25 - p) === 1);
}

/** The lowest free (unpinned) opponent checker, in `me`'s numbering. 25 if none. */
function lowestFreeOpponent(them: PlakotoSide): number {
  for (let q = 24; q >= 1; q -= 1) {
    if (at(them, q) > 0 && at(them, PINNED + q) !== 1) return 25 - q;
  }
  // Every opponent checker is pinned (or off): nothing to block.
  return 25;
}

/** The value, in logits, of pinning the opponent checker on their own point `q`. */
function pinValue(q: number, w: PlakotoWeights): number {
  if (q === START) return w.motherPinned;
  return w.pinBase + (w.pinPips * q) / 24 + (25 - q <= 6 ? w.pinHome : 0);
}

/** Pips the side still needs to bring every checker home (own 1–6). */
function pipsToHome(side: PlakotoSide): number {
  let total = 0;
  for (let p = 7; p <= 24; p += 1) total += at(side, p) * (p - 6);
  return total;
}

/** The share of losses that are doubles, in contact. */
function doubleShare(loser: PlakotoSide, winner: PlakotoSide, w: PlakotoWeights): number {
  if (motherPinned(loser)) return w.motherDouble;
  if (at(loser, OFF) > 0) return 0;
  return Math.min(0.9, (w.double * pipsToHome(loser)) / (pips(winner) + 20));
}

/** The features one side gets on its own, in logits (good for `me`). */
function sideScore(me: PlakotoSide, them: PlakotoSide, w: PlakotoWeights): number {
  let score = 0;
  // Made points.
  for (let p = 1; p <= 23; p += 1) if (at(me, p) >= 2) score += w.madePoint * at(w.pointShape, p);

  // Pins we hold.
  for (let q = 1; q <= 24; q += 1) if (at(them, PINNED + q) === 1) score += pinValue(q, w);

  // Home board, per free opponent checker that still has to get out of it.
  let back = 0;
  let homeDoors = 0;
  for (let p = 1; p <= 6; p += 1) {
    const q = 25 - p;
    if (at(them, PINNED + q) !== 1) back += at(them, q);
    if (isDoor(me, them, p)) homeDoors += 1;
  }
  score += w.homePointPerBack * homeDoors * Math.min(3, back);

  // The longest prime with a free opponent checker behind it.
  const theirBack = lowestFreeOpponent(them);
  let longest = 0;
  let run = 0;
  for (let p = 1; p <= 24; p += 1) {
    if (isDoor(me, them, p)) {
      run += 1;
      if (run > longest && theirBack < p - run + 1) longest = run;
    } else {
      run = 0;
    }
  }
  score += w.prime * at(w.primeShape, Math.min(6, longest));

  // Borne off and stacks.
  score += w.borneOff * at(me, OFF);
  for (let p = 1; p <= 23; p += 1) score -= w.stack * Math.max(0, at(me, p) - 3);
  return score;
}

/** True when a free `them` checker is 1–12 pips behind our own point `p`. */
function inReach(them: PlakotoSide, p: number): boolean {
  for (let r = Math.max(1, p - 12); r < p; r += 1) {
    const q = 25 - r;
    if (at(them, q) > 0 && at(them, PINNED + q) !== 1) return true;
  }
  return false;
}

/**
 * The contact score, in logits, for the roller. The Plakoto net
 * (`plakoto-net.ts`) uses it as one of its inputs.
 */
export function contactScore(roller: PlakotoSide, waiter: PlakotoSide, w: PlakotoWeights): number {
  let score = w.race * logit(kleinmanWinChance(pips(roller), pips(waiter)));
  score += sideScore(roller, waiter, w) - sideScore(waiter, roller, w);

  // The roller's shots at the waiter's lone checkers.
  const shots = countPlakotoShots(roller, waiter);
  if (shots.any > 0) {
    for (let q = 1; q <= 24; q += 1) {
      const n = at(shots.perBlot, q);
      if (n === 0) continue;
      const value = q === START ? w.motherShot : w.blotShare * pinValue(q, w);
      score += (n / 36) * value;
    }
    score += (w.anyShot * shots.any) / 36;
  }

  // The roller's own lone checkers that the waiter could pin later.
  for (let p = 1; p <= 24; p += 1) {
    if (!isPinnable(waiter, roller, 25 - p) || !inReach(waiter, p)) continue;
    score -= p === START ? w.rollerMother : w.rollerBlot;
  }
  return score;
}

/** Scores two sides: `roller` is to roll. Exported for tests and tuning. */
export function evaluatePlakotoSides(
  roller: PlakotoSide,
  waiter: PlakotoSide,
  w: PlakotoWeights,
): Evaluation {
  if (at(waiter, OFF) === 15) {
    const loseDouble = at(roller, OFF) === 0 ? 1 : 0;
    return { win: 0, winDouble: 0, loseDouble, equity: -1 - loseDouble };
  }
  if (at(roller, OFF) === 15) {
    const winDouble = at(waiter, OFF) === 0 ? 1 : 0;
    return { win: 1, winDouble, loseDouble: 0, equity: 1 + winDouble };
  }
  let win: number;
  let winDouble: number;
  let loseDouble: number;
  if (plakotoContact(roller, waiter)) {
    win = sigmoid(contactScore(roller, waiter, w));
    winDouble = win * doubleShare(waiter, roller, w);
    loseDouble = (1 - win) * doubleShare(roller, waiter, w);
  } else {
    const rollerRolls = bearoffRolls(roller);
    const waiterRolls = rollerRolls === null ? null : bearoffRolls(waiter);
    if (rollerRolls !== null && waiterRolls !== null) {
      win = bearoffWinChance(rollerRolls, waiterRolls);
      return { win, winDouble: 0, loseDouble: 0, equity: 2 * win - 1 };
    }
    win = kleinmanWinChance(effectiveRacePips(roller), effectiveRacePips(waiter));
    winDouble = Math.min(win, raceDoubleChance(roller, waiter, true));
    loseDouble = Math.min(1 - win, raceDoubleChance(waiter, roller, false));
  }
  return { win, winDouble, loseDouble, equity: 2 * win - 1 + winDouble - loseDouble };
}

/**
 * The points for the mover if the game is over after the mover's turn, else
 * `null`. The same order as the engine's `result`: the mother rule first,
 * then bearing off. (A resignation cannot happen inside a turn.)
 */
export function plakotoTurnResult(
  mover: PlakotoSide,
  other: PlakotoSide,
  rules: MotherRules,
): number | null {
  const rule = rules.motherRule;
  if (rule !== 'none') {
    const otherPinned = motherPinned(other);
    const moverPinned = motherPinned(mover);
    // Both mothers pinned: a draw (`mutualMotherPin`).
    if (otherPinned && moverPinned) return 0;
    if (rule === 'instant') {
      if (otherPinned) return 2;
      if (moverPinned) return -2;
    }
    if (rule === 'federation') {
      if (otherPinned && at(mover, START) === 0) return 2;
      if (moverPinned && at(other, START) === 0) return -2;
    }
  }
  if (at(mover, OFF) === 15) return at(other, OFF) > 0 ? 1 : 2;
  return null;
}

/** Builds the evaluator. Weights default to `PLAKOTO_DEFAULT_WEIGHTS`. */
export function createPlakotoHeuristic(
  weights: PlakotoWeights = PLAKOTO_DEFAULT_WEIGHTS,
): Evaluator {
  return {
    id: PLAKOTO_HEURISTIC_ID,
    variant: 'plakoto',
    evaluate(state: GameState): Evaluation {
      return evaluatePlakotoSides(
        plakotoSideOf(state, state.toMove),
        plakotoSideOf(state, opponent(state.toMove)),
        weights,
      );
    },
    scoreTurns(state: GameState, turns: readonly Turn[]): TurnScore[] {
      const me = plakotoSideOf(state, state.toMove);
      const them = plakotoSideOf(state, opponent(state.toMove));
      const rules = state.rules.mother;
      return turns.map((turn) => {
        const [mine, theirs] = playPlakotoTurn(me, them, turn);
        const points = plakotoTurnResult(mine, theirs, rules);
        if (points !== null) return { score: points, gameOver: true };
        // The opponent rolls next: their equity is our loss.
        return { score: -evaluatePlakotoSides(theirs, mine, weights).equity, gameOver: false };
      });
    },
  };
}

/** The evaluator with the default weights. */
export const plakotoHeuristic: Evaluator = createPlakotoHeuristic();
