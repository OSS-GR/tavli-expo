/**
 * `asodio-heuristic-v1`: a hand-tuned evaluator for Asodio
 * (docs/architecture/bot-ai.md, section 4.2; rules in `docs/rules/asodio.md`,
 * owner version = preset `asodio.kafeneio`).
 *
 * It scores a position before the roll, from the view of the player to roll
 * (the "roller"). The other player is the "waiter". It works like the
 * Plakoto heuristic (`plakoto-heuristic.ts`), with the owner's army rules:
 *
 * - **Loading:** a waiting checker counts 25 pips (a die `d` enters it on
 *   spot `d`). While the first-entry gate holds (all 15 outside), the side
 *   also loses `gatePips`: on average 3.5 rolls pass before a 1-2 or a
 *   double.
 * - **The army moves as one (quarter lock):** a checker that enters a new
 *   quarter is frozen until the whole army has caught up. So a pin is worth
 *   much more when the pinned checker is in its owner's rear quarter
 *   (`pinRear`): when it is the last one there, the whole army freezes.
 *   A side with no legal move at all passes every roll (`frozen`), and each
 *   die value with no legal move is a lost die (`deadDie`).
 * - **Pins made and suffered,** and the lone checkers each side can pin
 *   next roll, with their shot counts (`asodio-shots.ts`: only checkers the
 *   army rules let move can shoot).
 * - **Race:** the Kleinman chance of the pip counts, as a logit.
 * - **Bearing off:** with no contact left, the Portes race code (Keith,
 *   Kleinman, the exact bear-off table). Asodio bears off as in Portes (A4).
 *
 * **Draws.** A deadlock (no side can ever move, A5) is a draw: the engine
 * ends the game there, so the bot sees it as a game end. Long before that,
 * the evaluator sees a **mutual lock** (`mutualLock` in `asodio-board.ts`):
 * each side has a pinned checker that can never be freed, because each
 * pinner is frozen in front of its own pinned rear. That game must end in a
 * draw, so it scores 0. And when the side to roll is behind, its chance to
 * make such a lock with the next roll (`lock` in `asodio-shots.ts`) pulls
 * the equity toward 0; when it is ahead, the other side's chance does
 * (× `waiterLock`). This is what keeps medium from walking into draws it
 * does not need (it cut medium-vs-random draws from about 34 % to 24 %).
 *
 * The Acey-Deucey presets (hits instead of pins) work too: a hit is worth
 * the pips it sends back (`hitBase`, `hitPips`). Their scores use the
 * `"tavli"` scale (1 or 2 points); `"perChecker"` is not modelled.
 *
 * All weights are in one typed object, `ASODIO_DEFAULT_WEIGHTS`. Change them
 * with `createAsodioHeuristic({ ...ASODIO_DEFAULT_WEIGHTS, pinBase: 0.5 })`.
 */

import type { GameState, Turn } from '@tavli/engine';
import { asodio, opponent } from '@tavli/engine';

import type { Evaluation, Evaluator, TurnScore } from '../types';
import {
  OFF,
  PINNED,
  allOutside,
  asodioContact,
  asodioOptions,
  asodioSideOf,
  lowestPinnedQuarter,
  movableDice,
  mutualLock,
  playAsodioTurn,
  quarterOf,
  rearQuarter,
} from './asodio-board';
import type { AsodioOptions, AsodioSide } from './asodio-board';
import { countAsodioShots } from './asodio-shots';
import { bearoffRolls, bearoffWinChance } from './bearoff';
import { pips } from './portes-board';
import { effectiveRacePips, kleinmanWinChance, raceDoubleChance } from './race';

/** The weights of the Asodio heuristic. Scores are in logits (win = sigmoid(score)). */
export interface AsodioWeights {
  /** How much the race counts while there is contact: × logit(Kleinman chance of the pip counts). */
  readonly race: number;
  /** Extra pips for a side that waits for its first 1-2 or double (first-entry gate). */
  readonly gatePips: number;
  /** Each opponent checker we pin: `pinBase + pinPips × its own point / 24 (+ pinRear)`. */
  readonly pinBase: number;
  /** The part of a pin's value that grows with how far the pinned checker is from home. */
  readonly pinPips: number;
  /** Extra when the pinned checker is in its owner's rear quarter (it holds the whole army back). */
  readonly pinRear: number;
  /** Captured by hitting (`captureMode: "hit"`): `hitBase + hitPips × pips lost / 24`. */
  readonly hitBase: number;
  readonly hitPips: number;
  /** The side has no legal move with any die: it passes every roll until something changes. */
  readonly frozen: number;
  /** Each die value 1–6 with no legal single move (that die of a roll is lost). */
  readonly deadDie: number;
  /** Waiter's lone checkers: each costs `shots / 36 × blotShare × (value of pinning it)`. */
  readonly blotShare: number;
  /** Extra of `any shot / 36`: the chance the roller pins at least one checker. */
  readonly anyShot: number;
  /** Roller's lone checkers: `shots / 36 × rollerShare × value` (the roller may still save them). */
  readonly rollerShare: number;
  /** How much of the waiter's chance to lock both armies (a draw) counts while the roller is ahead. */
  readonly waiterLock: number;
  /** Each made point (2+ checkers) on own 1–24 while there is contact. */
  readonly madePoint: number;
  /** Each checker borne off. */
  readonly borneOff: number;
  /** Double (mars) estimate in contact: `double × pips the loser needs to come home / (winner pips + 20)`. */
  readonly double: number;
  /** The share of losses that are doubles for a side with a pinned checker in its rear quarter. */
  readonly pinnedDouble: number;
}

/** The default weights. Hand-picked, then set by self-play (README, "Asodio weights"). */
export const ASODIO_DEFAULT_WEIGHTS: AsodioWeights = {
  race: 0.3,
  gatePips: 28,
  pinBase: 0.4,
  pinPips: 0.4,
  pinRear: 1.2,
  hitBase: 0.2,
  hitPips: 0.8,
  frozen: 1.5,
  deadDie: 0.08,
  blotShare: 0.6,
  anyShot: 0.2,
  rollerShare: 0.3,
  waiterLock: 0.5,
  madePoint: 0.04,
  borneOff: 0.04,
  double: 0.8,
  pinnedDouble: 0.8,
};

export const ASODIO_HEURISTIC_ID = 'asodio-heuristic-v1';

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

/** Pips still to go, with the gate wait. */
function racePips(side: AsodioSide, w: AsodioWeights, options: AsodioOptions): number {
  return pips(side) + (options.firstEntryGate && allOutside(side) ? w.gatePips : 0);
}

/** The value, in logits, of capturing a checker on its owner's own point `q` (`rear`: the owner's rear quarter). */
function captureValue(q: number, rear: number, w: AsodioWeights, options: AsodioOptions): number {
  if (!options.pin) return w.hitBase + (w.hitPips * (25 - q)) / 24;
  return w.pinBase + (w.pinPips * q) / 24 + (quarterOf(q) <= rear ? w.pinRear : 0);
}

/** True when the side has a pinned checker in its rear quarter. */
function pinnedInRear(side: AsodioSide): boolean {
  const rear = rearQuarter(side);
  for (let q = 1; q <= 24; q += 1) {
    if (side[PINNED + q] === 1 && quarterOf(q) <= rear) return true;
  }
  return false;
}

/** Pips the side still needs to bring every checker home (own 1–6). */
function pipsToHome(side: AsodioSide): number {
  let total = 0;
  for (let p = 7; p <= 25; p += 1) total += at(side, p) * (p - 6);
  return total;
}

/** The share of losses that are doubles (mars), in contact. */
function doubleShare(loser: AsodioSide, winner: AsodioSide, w: AsodioWeights): number {
  if (at(loser, OFF) > 0) return 0;
  const share = Math.min(0.9, (w.double * pipsToHome(loser)) / (pips(winner) + 20));
  return pinnedInRear(loser) ? Math.max(share, w.pinnedDouble) : share;
}

/** The features one side gets on its own, in logits (good for `me`). */
function sideScore(
  me: AsodioSide,
  them: AsodioSide,
  dice: readonly boolean[],
  w: AsodioWeights,
  options: AsodioOptions,
): number {
  let score = 0;
  // Pins we hold.
  if (options.pin) {
    const rear = rearQuarter(them);
    for (let q = 1; q <= 24; q += 1) {
      if (them[PINNED + q] === 1) score += captureValue(q, rear, w, options);
    }
  }
  // Dice with no move; a frozen army.
  let dead = 0;
  for (let die = 1; die <= 6; die += 1) if (dice[die] !== true) dead += 1;
  if (dead === 6) score -= w.frozen;
  else score -= w.deadDie * dead;
  // Made points, and checkers off.
  for (let p = 1; p <= 24; p += 1) if (at(me, p) >= 2) score += w.madePoint;
  score += w.borneOff * at(me, OFF);
  return score;
}

interface ShotValue {
  /** Logits: the chance of each pin × its value. */
  readonly value: number;
  /** The chance (0–1) to pin at least one checker next roll. */
  readonly any: number;
  /** The chance (0–1) of a pin that locks both armies for good (`mutualLock`): a sure draw. */
  readonly lock: number;
}

function lockable(options: AsodioOptions): boolean {
  return options.pin && options.quarterLock && !options.moveInsideFrozenQuarter;
}

/** The value of the shots of `shooter` at the lone checkers of `target`. */
function shotScore(
  shooter: AsodioSide,
  target: AsodioSide,
  w: AsodioWeights,
  options: AsodioOptions,
): ShotValue {
  // A new pin in the target's quarter `k` locks both armies when the shooter
  // already has a pinned checker in its quarter `2 - k` or lower.
  const lockQuarter = lockable(options) ? 2 - lowestPinnedQuarter(shooter) : -1;
  const shots = countAsodioShots(shooter, target, options, lockQuarter);
  if (shots.any === 0) return { value: 0, any: 0, lock: 0 };
  const rear = rearQuarter(target);
  let value = 0;
  for (let q = 1; q <= 24; q += 1) {
    const n = at(shots.perBlot, q);
    if (n > 0) value += (n / 36) * captureValue(q, rear, w, options);
  }
  return { value, any: shots.any / 36, lock: shots.lock / 36 };
}

interface Contact {
  /** Logits for the roller. */
  readonly score: number;
  /** The roller's chance to lock both armies next roll. */
  readonly rollerLock: number;
  /** The waiter's chance to lock both armies on its next roll. */
  readonly waiterLock: number;
}

/** The contact score, in logits, for the roller. */
function contactScore(
  roller: AsodioSide,
  waiter: AsodioSide,
  rollerDice: readonly boolean[],
  waiterDice: readonly boolean[],
  w: AsodioWeights,
  options: AsodioOptions,
): Contact {
  const chance = kleinmanWinChance(racePips(roller, w, options), racePips(waiter, w, options));
  let score = w.race * logit(chance);
  score += sideScore(roller, waiter, rollerDice, w, options);
  score -= sideScore(waiter, roller, waiterDice, w, options);
  const mine = shotScore(roller, waiter, w, options);
  score += w.blotShare * mine.value + w.anyShot * mine.any;
  const theirs = shotScore(waiter, roller, w, options);
  score -= w.rollerShare * theirs.value;
  return { score, rollerLock: mine.lock, waiterLock: theirs.lock };
}

const DRAW: Evaluation = { win: 0, winDouble: 0, loseDouble: 0, equity: 0 };

/** An evaluation where a share `draw` of the games end in a draw (0 points). */
function withDraws(
  win: number,
  winDouble: number,
  loseDouble: number,
  draw: number,
  options: AsodioOptions,
): Evaluation {
  const keep = 1 - draw;
  if (options.scoring === 'singleOnly') {
    return { win: keep * win, winDouble: 0, loseDouble: 0, equity: keep * (2 * win - 1) };
  }
  return {
    win: keep * win,
    winDouble: keep * winDouble,
    loseDouble: keep * loseDouble,
    equity: keep * (2 * win - 1 + winDouble - loseDouble),
  };
}

/** Scores two sides: `roller` is to roll. Exported for tests and tuning. */
export function evaluateAsodioSides(
  roller: AsodioSide,
  waiter: AsodioSide,
  w: AsodioWeights,
  options: AsodioOptions,
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
  if (asodioContact(roller, waiter)) {
    // Both armies hold each other forever: the game will end in a deadlock draw.
    if (mutualLock(roller, waiter, options)) return DRAW;
    const rollerDice = movableDice(roller, waiter, options);
    const waiterDice = movableDice(waiter, roller, options);
    // A5: no one can ever move again, a draw (the engine ends the game here).
    if (!rollerDice.includes(true) && !waiterDice.includes(true)) return DRAW;
    const contact = contactScore(roller, waiter, rollerDice, waiterDice, w, options);
    win = sigmoid(contact.score);
    winDouble = win * doubleShare(waiter, roller, w);
    loseDouble = (1 - win) * doubleShare(roller, waiter, w);
    const equity = 2 * win - 1 + winDouble - loseDouble;
    // The side that is behind takes a pin that locks both armies (a sure draw).
    const draw = equity < 0 ? contact.rollerLock : w.waiterLock * contact.waiterLock;
    if (draw > 0) return withDraws(win, winDouble, loseDouble, draw, options);
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
  return withDraws(win, winDouble, loseDouble, 0, options);
}

/** The points a loser pays (`asodio.md`, "Winning & scoring"). */
function lossPoints(options: AsodioOptions, loserOff: number): number {
  switch (options.scoring) {
    case 'perChecker':
      return 15 - loserOff;
    case 'singleOnly':
      return 1;
    case 'tavli':
      return loserOff > 0 ? 1 : 2;
  }
}

/**
 * The points for the mover if the game is over after the mover's turn, else
 * `null`. The same order as the engine's `result`: bearing off, then the
 * deadlock (A5: a draw, 0 points).
 */
export function asodioTurnResult(
  mover: AsodioSide,
  other: AsodioSide,
  options: AsodioOptions,
): number | null {
  if (at(mover, OFF) === 15) return lossPoints(options, at(other, OFF));
  if (!movableDice(mover, other, options).includes(true)) {
    if (!movableDice(other, mover, options).includes(true)) return 0;
  }
  return null;
}

/** The generic path: the engine plays each turn (it knows the roll chains). */
function scoreWithEngine(
  evaluate: (state: GameState) => Evaluation,
  state: GameState,
  turns: readonly Turn[],
): TurnScore[] {
  return turns.map((turn) => {
    const after = asodio.applyTurn(state, turn);
    const result = asodio.result(after);
    if (result !== null) {
      const points = result.winner === null ? 0 : result.points;
      return { score: result.winner === state.toMove ? points : -points, gameOver: true };
    }
    const equity = evaluate(after).equity;
    return { score: after.toMove === state.toMove ? equity : -equity, gameOver: false };
  });
}

/** Builds the evaluator. Weights default to `ASODIO_DEFAULT_WEIGHTS`. */
export function createAsodioHeuristic(weights: AsodioWeights = ASODIO_DEFAULT_WEIGHTS): Evaluator {
  const evaluate = (state: GameState): Evaluation =>
    evaluateAsodioSides(
      asodioSideOf(state, state.toMove),
      asodioSideOf(state, opponent(state.toMove)),
      weights,
      asodioOptions(state.rules),
    );
  return {
    id: ASODIO_HEURISTIC_ID,
    variant: 'asodio',
    evaluate,
    scoreTurns(state: GameState, turns: readonly Turn[]): TurnScore[] {
      const options = asodioOptions(state.rules);
      // A roll chain (Acey-Deucey presets) may keep the same player to move: let the engine play it.
      if (options.chains) return scoreWithEngine(evaluate, state, turns);
      const me = asodioSideOf(state, state.toMove);
      const them = asodioSideOf(state, opponent(state.toMove));
      return turns.map((turn) => {
        const [mine, theirs] = playAsodioTurn(me, them, turn);
        const points = asodioTurnResult(mine, theirs, options);
        if (points !== null) return { score: points, gameOver: true };
        // The opponent rolls next: their equity is our loss.
        return {
          score: -evaluateAsodioSides(theirs, mine, weights, options).equity,
          gameOver: false,
        };
      });
    },
  };
}

/** The evaluator with the default weights. */
export const asodioHeuristic: Evaluator = createAsodioHeuristic();
