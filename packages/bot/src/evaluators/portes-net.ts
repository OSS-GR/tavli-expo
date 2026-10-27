/**
 * `portes-net`: a small neural net for Portes, trained by TD(λ) self-play
 * (docs/architecture/bot-ai.md, section 5; the training code is in
 * `src/train/`).
 *
 * It scores a position before the roll, from the view of the player to
 * roll (the "roller"), like the heuristic. The net only scores **contact**
 * positions. A pure race (no contact) and a finished game use the Portes
 * heuristic (`evaluateSides`: the Keith count, the Kleinman metric and the
 * exact bear-off table), so the net does not have to learn the race.
 *
 * The net: `PORTES_NET_INPUTS` inputs → one hidden layer (sigmoid) → 3
 * outputs (sigmoid): P(win), P(win a diplo), P(lose a diplo).
 *
 * Inputs (`encodePortes`), the roller's side first, then the waiter's, each
 * in its own numbering:
 *
 * - per own point 1–24, 4 inputs (TD-Gammon style): n ≥ 1, n ≥ 2, n ≥ 3,
 *   and (n − 3) / 2 for n > 3 (192 in all);
 * - checkers on the bar / 2, borne off / 15 (4);
 * - pip counts / 100 (2);
 * - the rolls out of 36 that hit a blot, for each side (`shots.ts`) (2);
 * - the heuristic's contact score in logits / 4 (`contactScore`) (1).
 *
 * The first layer is sparse: most inputs are 0, so the hidden sums only add
 * the weight rows of the inputs that are not 0.
 */

import type { GameState, Turn } from '@tavli/engine';
import { opponent } from '@tavli/engine';

import type { Evaluation, Evaluator, TurnScore } from '../types';
import { decodeFloat32 } from './float-codec';
import { BAR, OFF, hasContact, pips, playTurn, sideOf } from './portes-board';
import type { Side } from './portes-board';
import { PORTES_DEFAULT_WEIGHTS, contactScore, evaluateSides } from './portes-heuristic';
import { PORTES_NET_V1 } from './portes-net-weights';
import { countShots } from './shots';

/** Number of inputs. */
export const PORTES_NET_INPUTS = 201;
/** Number of outputs: P(win), P(win a diplo), P(lose a diplo). */
export const PORTES_NET_OUTPUTS = 3;

/** A typed array of weights: Float32 to ship and play, Float64 to train. */
export type NetArray = Float32Array | Float64Array;

/**
 * The weights of a net with one hidden layer.
 *
 * - `w1[i * hidden + h]`: from input `i` to hidden unit `h` (rows by input,
 *   so a sparse input adds one row);
 * - `b1[h]`, `w2[k * hidden + h]` (hidden `h` to output `k`), `b2[k]`.
 */
export interface PortesNet {
  readonly inputs: number;
  readonly hidden: number;
  readonly w1: NetArray;
  readonly b1: NetArray;
  readonly w2: NetArray;
  readonly b2: NetArray;
}

/** The shipped form of a net: the sizes and the weights as base64 Float32. */
export interface PortesNetFile {
  readonly id: string;
  readonly inputs: number;
  readonly hidden: number;
  /** `w1`, `b1`, `w2`, `b2` in that order, little-endian Float32, base64. */
  readonly data: string;
  /** How it was trained, for people. */
  readonly notes?: string;
}

/** The inputs of one position that are not 0: `index[k]` has `value[k]`. */
export interface SparseInput {
  readonly index: Int32Array;
  readonly value: Float64Array;
  count: number;
}

export function createSparseInput(): SparseInput {
  return {
    index: new Int32Array(PORTES_NET_INPUTS),
    value: new Float64Array(PORTES_NET_INPUTS),
    count: 0,
  };
}

function push(input: SparseInput, index: number, value: number): void {
  input.index[input.count] = index;
  input.value[input.count] = value;
  input.count += 1;
}

function at(values: readonly number[], i: number): number {
  return values[i] ?? 0;
}

/** Writes the inputs of a contact position into `input` (it is reused). */
export function encodePortes(roller: Side, waiter: Side, input: SparseInput): void {
  input.count = 0;
  for (let s = 0; s < 2; s += 1) {
    const side = s === 0 ? roller : waiter;
    const base = s * 96;
    for (let p = 1; p <= 24; p += 1) {
      const n = at(side, p);
      if (n === 0) continue;
      const i = base + (p - 1) * 4;
      push(input, i, 1);
      if (n > 1) push(input, i + 1, 1);
      if (n > 2) push(input, i + 2, 1);
      if (n > 3) push(input, i + 3, (n - 3) / 2);
    }
  }
  if (at(roller, BAR) > 0) push(input, 192, at(roller, BAR) / 2);
  if (at(waiter, BAR) > 0) push(input, 193, at(waiter, BAR) / 2);
  if (at(roller, OFF) > 0) push(input, 194, at(roller, OFF) / 15);
  if (at(waiter, OFF) > 0) push(input, 195, at(waiter, OFF) / 15);
  push(input, 196, pips(roller) / 100);
  push(input, 197, pips(waiter) / 100);
  const rollerShots = countShots(roller, waiter).any;
  if (rollerShots > 0) push(input, 198, rollerShots / 36);
  const waiterShots = countShots(waiter, roller).any;
  if (waiterShots > 0) push(input, 199, waiterShots / 36);
  push(input, 200, contactScore(roller, waiter, PORTES_DEFAULT_WEIGHTS) / 4);
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * The forward pass. Writes the hidden activations into `hiddenOut` and the
 * 3 outputs into `out`.
 */
export function forward(
  net: PortesNet,
  input: SparseInput,
  hiddenOut: Float64Array,
  out: Float64Array,
): void {
  const { hidden: size, w1, b1, w2, b2 } = net;
  for (let h = 0; h < size; h += 1) hiddenOut[h] = b1[h] ?? 0;
  for (let k = 0; k < input.count; k += 1) {
    const v = input.value[k] ?? 0;
    const row = (input.index[k] ?? 0) * size;
    for (let h = 0; h < size; h += 1) {
      hiddenOut[h] = (hiddenOut[h] ?? 0) + v * (w1[row + h] ?? 0);
    }
  }
  for (let h = 0; h < size; h += 1) hiddenOut[h] = sigmoid(hiddenOut[h] ?? 0);
  for (let o = 0; o < PORTES_NET_OUTPUTS; o += 1) {
    let sum = b2[o] ?? 0;
    const row = o * size;
    for (let h = 0; h < size; h += 1) sum += (w2[row + h] ?? 0) * (hiddenOut[h] ?? 0);
    out[o] = sigmoid(sum);
  }
}

/** Turns the 3 outputs into an `Evaluation`. A diplo is at most the win (or loss) chance. */
export function toEvaluation(win: number, winDouble: number, loseDouble: number): Evaluation {
  const wd = Math.min(win, winDouble);
  const ld = Math.min(1 - win, loseDouble);
  return { win, winDouble: wd, loseDouble: ld, equity: 2 * win - 1 + wd - ld };
}

/** Builds a `PortesNet` from its shipped form. Throws if the sizes do not match. */
export function loadPortesNet(file: PortesNetFile): PortesNet {
  const { inputs, hidden } = file;
  if (inputs !== PORTES_NET_INPUTS) {
    throw new RangeError(
      `net "${file.id}" has ${inputs} inputs, the code needs ${PORTES_NET_INPUTS}`,
    );
  }
  const all = decodeFloat32(file.data);
  const sizes = [inputs * hidden, hidden, PORTES_NET_OUTPUTS * hidden, PORTES_NET_OUTPUTS];
  const total = sizes.reduce((a, b) => a + b, 0);
  if (all.length !== total) {
    throw new RangeError(`net "${file.id}" has ${all.length} weights, expected ${total}`);
  }
  let start = 0;
  const parts = sizes.map((n) => {
    const part = all.subarray(start, start + n);
    start += n;
    return part;
  });
  const [w1, b1, w2, b2] = parts as [Float32Array, Float32Array, Float32Array, Float32Array];
  return { inputs, hidden, w1, b1, w2, b2 };
}

/** A reusable scratch space for one net, so scoring allocates nothing per position. */
export interface NetScratch {
  readonly input: SparseInput;
  readonly hidden: Float64Array;
  readonly out: Float64Array;
}

export function createScratch(net: PortesNet): NetScratch {
  return {
    input: createSparseInput(),
    hidden: new Float64Array(net.hidden),
    out: new Float64Array(PORTES_NET_OUTPUTS),
  };
}

/**
 * Scores two sides with the net (`roller` is to roll): the net in contact,
 * the heuristic in a race or at a game end.
 */
export function evaluateNetSides(
  net: PortesNet,
  roller: Side,
  waiter: Side,
  scratch: NetScratch = createScratch(net),
): Evaluation {
  if (at(roller, OFF) === 15 || at(waiter, OFF) === 15 || !hasContact(roller, waiter)) {
    return evaluateSides(roller, waiter, PORTES_DEFAULT_WEIGHTS);
  }
  encodePortes(roller, waiter, scratch.input);
  forward(net, scratch.input, scratch.hidden, scratch.out);
  return toEvaluation(scratch.out[0] ?? 0, scratch.out[1] ?? 0, scratch.out[2] ?? 0);
}

/** True if `loser` has a checker on the bar or in the winner's home (own 19–24). */
function isBackgammon(loser: Side): boolean {
  if (at(loser, BAR) > 0) return true;
  for (let p = 19; p <= 24; p += 1) if (at(loser, p) > 0) return true;
  return false;
}

/**
 * Scores each turn for the mover (1-ply), on the fast board: the true
 * points if the turn ends the game, else minus the opponent's equity.
 */
export function scoreNetTurns(
  net: PortesNet,
  state: GameState,
  turns: readonly Turn[],
  scratch: NetScratch = createScratch(net),
): TurnScore[] {
  const me = sideOf(state, state.toMove);
  const them = sideOf(state, opponent(state.toMove));
  const triple = state.rules.scoring.backgammonScores3;
  return turns.map((turn) => {
    const [mine, theirs] = playTurn(me, them, turn);
    if (at(mine, OFF) === 15) {
      let points = 1;
      if (at(theirs, OFF) === 0) points = triple && isBackgammon(theirs) ? 3 : 2;
      return { score: points, gameOver: true };
    }
    return { score: -evaluateNetSides(net, theirs, mine, scratch).equity, gameOver: false };
  });
}

/**
 * Builds the evaluator for a net. `net` may be a function: it then runs on
 * the first use, so the app does not decode the weights at start-up.
 */
export function createPortesNetEvaluator(
  net: PortesNet | (() => PortesNet),
  id: string,
): Evaluator {
  let loaded: { net: PortesNet; scratch: NetScratch } | undefined;
  const get = (): { net: PortesNet; scratch: NetScratch } => {
    if (loaded === undefined) {
      const value = typeof net === 'function' ? net() : net;
      loaded = { net: value, scratch: createScratch(value) };
    }
    return loaded;
  };
  return {
    id,
    variant: 'portes',
    evaluate(state: GameState): Evaluation {
      const { net: value, scratch } = get();
      return evaluateNetSides(
        value,
        sideOf(state, state.toMove),
        sideOf(state, opponent(state.toMove)),
        scratch,
      );
    },
    scoreTurns(state: GameState, turns: readonly Turn[]): TurnScore[] {
      const { net: value, scratch } = get();
      return scoreNetTurns(value, state, turns, scratch);
    },
  };
}

let shipped: PortesNet | undefined;

/** The shipped net (`PORTES_NET_V1`), decoded on the first call. */
export function shippedPortesNet(): PortesNet {
  shipped ??= loadPortesNet(PORTES_NET_V1);
  return shipped;
}

/** The shipped net as an evaluator, for the hard level. */
export const portesNet: Evaluator = createPortesNetEvaluator(shippedPortesNet, PORTES_NET_V1.id);
