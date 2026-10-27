/**
 * `portes-heuristic-v1`: a hand-tuned evaluator for Portes
 * (docs/architecture/bot-ai.md, section 4.2).
 *
 * It scores a position before the roll, from the view of the player to roll
 * (the "roller"). The other player is the "waiter".
 *
 * - **Contact:** a weighted sum of features gives a score in logits.
 *   `win = sigmoid(score)`. The race part of the score is the Kleinman
 *   chance (see `race.ts`), turned into a logit, so the pip lead counts the
 *   same way in both branches.
 * - **No contact (a pure race):** the Keith count and the Kleinman metric
 *   give `win` directly (`race.ts`). At the very end (both sides home with
 *   at most 6 checkers left) an exact one-sided bear-off table takes over
 *   (`bearoff.ts`).
 *
 * The diplo chances are rough estimates from how far the loser is from home.
 * `equity = 2·win − 1 + winDouble − loseDouble`, from −2 to +2. A "backgammon"
 * counts as a diplo here, also with `backgammonScores3`; the search scores a
 * real game end with the true points.
 *
 * All weights are in one typed object, `PORTES_DEFAULT_WEIGHTS`. Change them
 * with `createPortesHeuristic({ ...PORTES_DEFAULT_WEIGHTS, stack: 0.1 })`, or
 * tune them with `pnpm --filter @tavli/bot tune`.
 */

import type { GameState, Turn } from '@tavli/engine';
import { opponent } from '@tavli/engine';

import type { Evaluation, Evaluator, TurnScore } from '../types';
import { bearoffRolls, bearoffWinChance } from './bearoff';
import { BAR, OFF, hasContact, pips, playTurn, portesTurnPoints, sideOf } from './portes-board';
import type { Side } from './portes-board';
import { effectiveRacePips, kleinmanWinChance, raceDoubleChance } from './race';
import { countShots } from './shots';

/** The weights of the Portes heuristic. Scores are in logits (win = sigmoid(score)). */
export interface PortesWeights {
  /** How much the race counts while there is contact: × logit(Kleinman chance of the pip counts). */
  readonly race: number;
  /** A made point (2+ checkers) on own point 1–12: `madePoint × pointShape[point]`. */
  readonly madePoint: number;
  /** Relative value of a made point, index = own point 0–12 (0 unused). */
  readonly pointShape: readonly number[];
  /** Each made home point (1–6), per opponent checker on the bar (at most 3 count). */
  readonly homePointPerBar: number;
  /** The longest run of made points with opponent checkers behind it: `prime × primeShape[length]`. */
  readonly prime: number;
  /** Relative value of a prime, index = length 0–6. */
  readonly primeShape: readonly number[];
  /** A made point in the opponent's home (own 19–24), the best one: `anchor × anchorShape[point − 19]`. */
  readonly anchor: number;
  /** Relative value of an anchor on own point 19, 20, …, 24. */
  readonly anchorShape: readonly number[];
  /** Each further anchor counts this share of its value. */
  readonly secondAnchor: number;
  /** Each own checker on the bar (its 25 pips are already in the race). */
  readonly barChecker: number;
  /** Extra per bar checker, per made point in the opponent's home. */
  readonly barPerHomePoint: number;
  /** Each checker borne off. */
  readonly borneOff: number;
  /** Each checker past the third on one point (stacked, out of play). */
  readonly stack: number;
  /** Each checker past the second on own point 1 or 2 (buried, out of play). */
  readonly buried: number;
  /** Waiter's blots: each blot costs `shots / 36 × (blotBase + blotPips × pipsLost / 24 + …)`. */
  readonly blotBase: number;
  /** The part of a blot's cost that grows with the pips it loses when hit. */
  readonly blotPips: number;
  /** The part of a blot's cost per made point in the roller's home (the hit checker may dance). */
  readonly blotPerHomePoint: number;
  /** Extra cost of `any shot / 36`: the chance the roller hits at least one blot. */
  readonly anyShot: number;
  /** Each roller blot that the waiter could hit later (the roller may still fix it). */
  readonly rollerBlot: number;
  /** Diplo estimate in contact: `double × pips the loser needs to come home / (winner pips + 20)`. */
  readonly double: number;
}

/**
 * The default weights. Hand-picked, then checked by self-play with
 * `pnpm --filter @tavli/bot tune` (results in the README).
 */
export const PORTES_DEFAULT_WEIGHTS: PortesWeights = {
  race: 0.4,
  madePoint: 1,
  // Own point:   0  1     2     3     4     5     6    7     8     9     10    11    12
  pointShape: [0, 0.02, 0.08, 0.18, 0.3, 0.38, 0.35, 0.3, 0.2, 0.12, 0.08, 0.05, 0.02],
  homePointPerBar: 0.12,
  prime: 1,
  // Length:    0  1  2     3     4    5    6
  primeShape: [0, 0, 0.1, 0.25, 0.5, 0.9, 1.5],
  anchor: 0.5,
  // Own point:  19   20   21    22   23   24
  anchorShape: [0.9, 1, 0.9, 0.75, 0.6, 0.5],
  secondAnchor: 0.4,
  barChecker: 0.25,
  barPerHomePoint: 0.1,
  borneOff: 0.04,
  stack: 0.06,
  buried: 0.05,
  blotBase: 0.4,
  blotPips: 1.2,
  blotPerHomePoint: 0.12,
  anyShot: 0.2,
  rollerBlot: 0.06,
  double: 0.65,
};

export const PORTES_HEURISTIC_ID = 'portes-heuristic-v1';

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

/** Made points on own 1–6. */
function homePoints(side: Side): number {
  let made = 0;
  for (let p = 1; p <= 6; p += 1) if (at(side, p) >= 2) made += 1;
  return made;
}

/** The waiter's (or any side's) back checker, written in the other side's numbering. 0 = on the bar. */
function backInOtherNumbering(side: Side): number {
  if (at(side, BAR) > 0) return 0;
  for (let q = 24; q >= 1; q -= 1) if (at(side, q) > 0) return 25 - q;
  return 25;
}

/** Pips the side still needs to bring every checker home (own 1–6). */
function pipsToHome(side: Side): number {
  let total = 0;
  for (let p = 7; p <= 25; p += 1) total += at(side, p) * (p - 6);
  return total;
}

/** The share of losses that are diplos, in contact. */
function doubleShare(loser: Side, winner: Side, w: PortesWeights): number {
  if (at(loser, OFF) > 0) return 0;
  return Math.min(0.9, (w.double * pipsToHome(loser)) / (pips(winner) + 20));
}

/** The features one side gets on its own, in logits (good for `me`). */
function sideScore(me: Side, them: Side, w: PortesWeights): number {
  let score = 0;
  // Made points.
  for (let p = 1; p <= 12; p += 1) if (at(me, p) >= 2) score += w.madePoint * at(w.pointShape, p);
  // A closed board matters most with opponent checkers on the bar.
  score += w.homePointPerBar * homePoints(me) * Math.min(3, at(them, BAR));

  // The longest prime with an opponent checker behind it.
  const theirBack = backInOtherNumbering(them);
  let longest = 0;
  let run = 0;
  for (let p = 1; p <= 24; p += 1) {
    if (at(me, p) >= 2) {
      run += 1;
      // The run covers p - run + 1 … p. It traps checkers below its start.
      if (run > longest && theirBack < p - run + 1) longest = run;
    } else {
      run = 0;
    }
  }
  score += w.prime * at(w.primeShape, Math.min(6, longest));

  // Anchors in the opponent's home.
  let best = 0;
  let total = 0;
  for (let p = 19; p <= 24; p += 1) {
    if (at(me, p) >= 2) {
      const value = at(w.anchorShape, p - 19);
      total += value;
      if (value > best) best = value;
    }
  }
  score += w.anchor * (best + w.secondAnchor * (total - best));

  // Bar, borne off, stacks and buried checkers.
  score -= at(me, BAR) * (w.barChecker + w.barPerHomePoint * homePoints(them));
  score += w.borneOff * at(me, OFF);
  for (let p = 1; p <= 24; p += 1) score -= w.stack * Math.max(0, at(me, p) - 3);
  score -= w.buried * (Math.max(0, at(me, 1) - 2) + Math.max(0, at(me, 2) - 2));
  return score;
}

/**
 * The contact score, in logits, for the roller. The Portes net
 * (`portes-net.ts`) uses it as one of its inputs.
 */
export function contactScore(roller: Side, waiter: Side, w: PortesWeights): number {
  let score = w.race * logit(kleinmanWinChance(pips(roller), pips(waiter)));
  score += sideScore(roller, waiter, w) - sideScore(waiter, roller, w);

  // The roller's shots at the waiter's blots.
  const shots = countShots(roller, waiter);
  if (shots.any > 0) {
    const rollerHome = homePoints(roller);
    for (let own = 1; own <= 24; own += 1) {
      const n = at(shots.perBlot, own);
      if (n === 0) continue;
      const cost = w.blotBase + (w.blotPips * (25 - own)) / 24 + w.blotPerHomePoint * rollerHome;
      score += (n / 36) * cost;
    }
    score += (w.anyShot * shots.any) / 36;
  }

  // The roller's own blots that the waiter could still hit.
  const waiterBack = backInOtherNumbering(waiter);
  let rollerBlots = 0;
  for (let p = waiterBack + 1; p <= 24; p += 1) if (at(roller, p) === 1) rollerBlots += 1;
  score -= w.rollerBlot * rollerBlots;
  return score;
}

/** Scores two sides: `roller` is to roll. Exported for tests and tuning. */
export function evaluateSides(roller: Side, waiter: Side, w: PortesWeights): Evaluation {
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
  if (hasContact(roller, waiter)) {
    win = sigmoid(contactScore(roller, waiter, w));
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

/** Builds the evaluator. Weights default to `PORTES_DEFAULT_WEIGHTS`. */
export function createPortesHeuristic(weights: PortesWeights = PORTES_DEFAULT_WEIGHTS): Evaluator {
  return {
    id: PORTES_HEURISTIC_ID,
    variant: 'portes',
    evaluate(state: GameState): Evaluation {
      return evaluateSides(
        sideOf(state, state.toMove),
        sideOf(state, opponent(state.toMove)),
        weights,
      );
    },
    scoreTurns(state: GameState, turns: readonly Turn[]): TurnScore[] {
      const me = sideOf(state, state.toMove);
      const them = sideOf(state, opponent(state.toMove));
      const triple = state.rules.scoring.backgammonScores3;
      return turns.map((turn) => {
        const [mine, theirs] = playTurn(me, them, turn);
        const points = portesTurnPoints(mine, theirs, triple);
        if (points !== null) return { score: points, gameOver: true };
        // The opponent rolls next: their equity is our loss.
        return { score: -evaluateSides(theirs, mine, weights).equity, gameOver: false };
      });
    },
  };
}

/** The evaluator with the default weights. */
export const portesHeuristic: Evaluator = createPortesHeuristic();
