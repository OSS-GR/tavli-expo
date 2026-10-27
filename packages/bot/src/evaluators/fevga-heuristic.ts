/**
 * `fevga-heuristic-v1`: a hand-tuned evaluator for Fevga
 * (docs/architecture/bot-ai.md, section 4.2; rules in `docs/rules/fevga.md`).
 *
 * It scores a position before the roll, from the view of the player to roll
 * (the "roller"). The other player is the "waiter".
 *
 * Fevga has no hitting. A single checker holds a point, and nobody may land
 * on it. So the game is a race in which each side tries to slow the other
 * down with blocks. The features:
 *
 * - **Race:** the Kleinman chance of the pip counts (`race.ts`), as a logit.
 * - **Primes:** the best run of held points in front of opponent checkers,
 *   worth more when many opponent checkers are behind it.
 * - **Blocks:** the opponent's points in front of a side's last checker; for
 *   each own point with checkers, the dice whose landing point the opponent
 *   holds; and the dice values with no legal move at all (a lost roll).
 * - **Runner:** while the runner rule holds the checkers on point 24, the
 *   side can move only its runner. That costs more the further the runner
 *   still has to go.
 * - **Home board:** held points in own home (1–6). They block the opponent's
 *   second quarter and spread the checkers for the bear-off.
 * - **Mother:** each checker still on own point 24. It holds the
 *   opponent's point 12 (the self-play tuning likes a small bonus).
 * - **Stacking:** each checker past the third on one point.
 *
 * With no contact left (every checker has passed every opponent checker),
 * the position is a pure race, as in Portes: the Keith count and the
 * Kleinman metric, and the exact one-sided bear-off table at the very end.
 *
 * `equity = 2·win − 1 + winDouble − loseDouble`, from −2 to +2. A diplo
 * (mars) is a win while the loser has borne off nothing.
 *
 * All weights are in one typed object, `FEVGA_DEFAULT_WEIGHTS`. Change them
 * with `createFevgaHeuristic({ ...FEVGA_DEFAULT_WEIGHTS, stack: 0.1 })`.
 */

import type { GameState, RuleSet, Turn } from '@tavli/engine';
import { opponent } from '@tavli/engine';

import type { Evaluation, Evaluator, TurnScore } from '../types';
import { bearoffRolls, bearoffWinChance } from './bearoff';
import {
  fevgaHasContact,
  fevgaSideOf,
  otherPoint,
  playFevgaTurn,
  rearPoint,
  runnerLocked,
} from './fevga-board';
import { OFF, pips } from './portes-board';
import type { Side } from './portes-board';
import { effectiveRacePips, kleinmanWinChance, pipsToSaveDouble, raceDoubleChance } from './race';

/** The weights of the Fevga heuristic. Scores are in logits (win = sigmoid(score)). */
export interface FevgaWeights {
  /** How much the race counts while there is contact: × logit(Kleinman chance of the pip counts). */
  readonly race: number;
  /** The best run of held points with opponent checkers behind it: `prime × primeShape[length]`. */
  readonly prime: number;
  /** Relative value of a prime, index = length 0–6. */
  readonly primeShape: readonly number[];
  /** Extra prime value per share of the opponent's 15 checkers behind it: `trapped × primeShape[length] × behind / 15`. */
  readonly trapped: number;
  /** Each point the opponent holds in front of the side's last checker. */
  readonly pointAhead: number;
  /** Each (own point, die) whose landing point the opponent holds, × min(checkers on the point, 3) / 6. */
  readonly blockedLanding: number;
  /** Each die value 1–6 that has no legal single move now (that die of a roll is lost). */
  readonly stuckDie: number;
  /** While the runner has not passed its target (own point 11): the other checkers are stuck on 24. */
  readonly runnerLock: number;
  /** Extra while the runner is not through: × (runner point − target) / (24 − target). */
  readonly runnerDistance: number;
  /** Each held point in own home (1–6), while there is contact. */
  readonly homePoint: number;
  /** Each checker still on own point 24 (the mother), while there is contact. */
  readonly startChecker: number;
  /** Each checker past the third on one point (stacked, out of play). */
  readonly stack: number;
  /** Each checker borne off. */
  readonly borneOff: number;
  /** Diplo estimate in contact: `double × pips the loser needs to save it / (winner pips + 20)`. */
  readonly double: number;
}

/**
 * The default weights. Hand-picked, then set by self-play: a coordinate
 * search with paired medium-vs-medium games (the README has the steps).
 */
export const FEVGA_DEFAULT_WEIGHTS: FevgaWeights = {
  // Low on purpose: every play of a roll moves the same pips, and a high
  // race weight drowns the block features (0.8 → 0.3 won +0.23 points/game).
  race: 0.3,
  prime: 1,
  // Length:    0  1  2     3     4     5    6
  primeShape: [0, 0, 0.05, 0.15, 0.35, 0.7, 1.2],
  trapped: 1,
  pointAhead: 0.2,
  blockedLanding: 0.05,
  stuckDie: 0.15,
  runnerLock: 0.3,
  runnerDistance: 0.3,
  homePoint: 0.05,
  startChecker: 0.1,
  stack: 0.04,
  borneOff: 0.02,
  double: 0.4,
};

export const FEVGA_HEURISTIC_ID = 'fevga-heuristic-v1';

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

/** The runner target of the rules: own point 11 (`passMother`), 12, or `null` with no runner rule. */
export function runnerTargetOf(rules: RuleSet): number | null {
  const { movement } = rules;
  if (!movement.runnerRule) return null;
  return movement.runnerTarget === 'passMother' ? 11 : 12;
}

/** True if `side` holds the other side's own point `q` (1–24). */
function holds(side: Side, q: number): boolean {
  return at(side, otherPoint(q)) > 0;
}

/** The names of the raw features that `sideFeatures` returns, in order. */
export const FEVGA_FEATURES = [
  'prime',
  'trapped',
  'pointsAhead',
  'blocked',
  'stuck',
  'runnerLock',
  'runnerDistance',
  'homePoints',
  'startCheckers',
  'stacked',
  'off',
] as const;

/**
 * The raw features of `mover`, with `blocker` as the opponent. Everything is
 * in `mover`'s numbering. Exported for tests and tuning.
 */
export function sideFeatures(
  mover: Side,
  blocker: Side,
  target: number | null,
  primeShape: readonly number[],
): number[] {
  const rear = rearPoint(mover);

  // Primes: runs of points the blocker holds, with mover checkers behind them.
  let prime = 0;
  let trapped = 0;
  let best = 0;
  let behind = 0;
  let pointsAhead = 0;
  for (let p = rear - 1; p >= 1; p -= 1) {
    behind += at(mover, p + 1);
    if (!holds(blocker, p)) continue;
    let low = p;
    while (low > 1 && holds(blocker, low - 1)) low -= 1;
    pointsAhead += p - low + 1;
    const shape = at(primeShape, Math.min(6, p - low + 1));
    // Keep the run that traps the most: its shape, more with more checkers behind it.
    if (shape * (1 + behind / 15) > best) {
      best = shape * (1 + behind / 15);
      prime = shape;
      trapped = (shape * behind) / 15;
    }
    // A held point has no mover checkers, so skipping the run misses none.
    p = low;
  }

  // Blocked landing points, and dice with no move at all.
  const locked = runnerLocked(mover, target);
  let allHome = true;
  for (let p = 7; p <= 24; p += 1) if (at(mover, p) > 0) allHome = false;
  let blocked = 0;
  let canPlay = 0; // bit d set: some checker can move with die d
  for (let p = 1; p <= 24; p += 1) {
    const n = at(mover, p);
    if (n === 0) continue;
    const weight = Math.min(n, 3);
    const frozen = p === 24 && locked;
    for (let d = 1; d <= 6; d += 1) {
      const to = p - d;
      if (to >= 1) {
        if (holds(blocker, to)) blocked += weight;
        else if (!frozen) canPlay |= 1 << d;
      } else if (allHome && (to === 0 || p === rear)) {
        canPlay |= 1 << d;
      }
    }
  }
  let stuck = 0;
  // A side with every checker off has nothing to move; that is a win, not a block.
  if (at(mover, OFF) < 15) {
    for (let d = 1; d <= 6; d += 1) if ((canPlay & (1 << d)) === 0) stuck += 1;
  }

  // The runner rule: until the runner is through, only it can move.
  let runnerLock = 0;
  let runnerDistance = 0;
  if (target !== null && at(mover, OFF) === 0) {
    let through = false;
    for (let p = 1; p <= target; p += 1) if (at(mover, p) > 0) through = true;
    if (!through) {
      let runner = 24;
      for (let p = 23; p > target; p -= 1) {
        if (at(mover, p) > 0) {
          runner = p;
          break;
        }
      }
      runnerLock = 1;
      runnerDistance = (runner - target) / (24 - target);
    }
  }

  let homePoints = 0;
  for (let p = 1; p <= 6; p += 1) if (at(mover, p) > 0) homePoints += 1;
  let stacked = 0;
  for (let p = 1; p <= 24; p += 1) stacked += Math.max(0, at(mover, p) - 3);
  return [
    prime,
    trapped,
    pointsAhead,
    blocked / 6,
    stuck,
    runnerLock,
    runnerDistance,
    homePoints,
    at(mover, 24),
    stacked,
    at(mover, OFF),
  ];
}

/** Weight per feature, in `FEVGA_FEATURES` order. A cost has a minus sign. */
function featureWeights(w: FevgaWeights): number[] {
  return [
    -w.prime,
    -w.trapped,
    -w.pointAhead,
    -w.blockedLanding,
    -w.stuckDie,
    -w.runnerLock,
    -w.runnerDistance,
    w.homePoint,
    w.startChecker,
    -w.stack,
    w.borneOff,
  ];
}

const weightCache = new WeakMap<FevgaWeights, number[]>();

/** The contact score, in logits, for the roller. */
function contactScore(roller: Side, waiter: Side, target: number | null, w: FevgaWeights): number {
  let weights = weightCache.get(w);
  if (weights === undefined) {
    weights = featureWeights(w);
    weightCache.set(w, weights);
  }
  let score = w.race * logit(kleinmanWinChance(pips(roller), pips(waiter)));
  const mine = sideFeatures(roller, waiter, target, w.primeShape);
  const theirs = sideFeatures(waiter, roller, target, w.primeShape);
  for (let i = 0; i < weights.length; i += 1) {
    score += (weights[i] ?? 0) * ((mine[i] ?? 0) - (theirs[i] ?? 0));
  }
  return score;
}

/** The share of losses that are diplos, in contact. */
function doubleShare(loser: Side, winner: Side, w: FevgaWeights): number {
  if (at(loser, OFF) > 0) return 0;
  return Math.min(0.9, (w.double * pipsToSaveDouble(loser)) / (pips(winner) + 20));
}

/**
 * Scores two sides: `roller` is to roll. `target` is the runner target
 * (`runnerTargetOf`). Exported for tests and tuning.
 */
export function evaluateFevgaSides(
  roller: Side,
  waiter: Side,
  target: number | null,
  w: FevgaWeights,
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
  if (fevgaHasContact(roller, waiter)) {
    win = sigmoid(contactScore(roller, waiter, target, w));
    winDouble = win * doubleShare(waiter, roller, w);
    loseDouble = (1 - win) * doubleShare(roller, waiter, w);
  } else {
    const rollerRolls = bearoffRolls(roller);
    const waiterRolls = rollerRolls === null ? null : bearoffRolls(waiter);
    if (rollerRolls !== null && waiterRolls !== null) {
      // Both sides have at most 6 checkers left, so both have borne off: no diplo.
      win = bearoffWinChance(rollerRolls, waiterRolls);
      return { win, winDouble: 0, loseDouble: 0, equity: 2 * win - 1 };
    }
    win = kleinmanWinChance(effectiveRacePips(roller), effectiveRacePips(waiter));
    winDouble = Math.min(win, raceDoubleChance(roller, waiter, true));
    loseDouble = Math.min(1 - win, raceDoubleChance(waiter, roller, false));
  }
  return { win, winDouble, loseDouble, equity: 2 * win - 1 + winDouble - loseDouble };
}

/** Builds the evaluator. Weights default to `FEVGA_DEFAULT_WEIGHTS`. */
export function createFevgaHeuristic(weights: FevgaWeights = FEVGA_DEFAULT_WEIGHTS): Evaluator {
  return {
    id: FEVGA_HEURISTIC_ID,
    variant: 'fevga',
    evaluate(state: GameState): Evaluation {
      return evaluateFevgaSides(
        fevgaSideOf(state, state.toMove),
        fevgaSideOf(state, opponent(state.toMove)),
        runnerTargetOf(state.rules),
        weights,
      );
    },
    scoreTurns(state: GameState, turns: readonly Turn[]): TurnScore[] {
      const me = fevgaSideOf(state, state.toMove);
      const them = fevgaSideOf(state, opponent(state.toMove));
      const target = runnerTargetOf(state.rules);
      return turns.map((turn) => {
        const mine = playFevgaTurn(me, turn);
        if (at(mine, OFF) === 15) {
          // fevga.md, "Winning & scoring": 2 points if the loser has borne off nothing.
          return { score: at(them, OFF) === 0 ? 2 : 1, gameOver: true };
        }
        // The opponent rolls next: their equity is our loss.
        return { score: -evaluateFevgaSides(them, mine, target, weights).equity, gameOver: false };
      });
    },
  };
}

/** The evaluator with the default weights. */
export const fevgaHeuristic: Evaluator = createFevgaHeuristic();
