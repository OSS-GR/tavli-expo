/**
 * The shared code of the trained nets (Portes, Plakoto, Fevga;
 * docs/architecture/bot-ai.md, section 5).
 *
 * Each net has one hidden layer (sigmoid) and 3 outputs (sigmoid):
 * P(win), P(win a double), P(lose a double). It scores a position before
 * the roll, from the view of the player to roll (the "roller"). The other
 * player is the "waiter".
 *
 * A game plugs in through `NetGame`: its fast board arrays, its game end,
 * its input encoding, and the positions the net does not score (a race, a
 * game end, a pinned Plakoto mother). Those use the game's heuristic. One
 * evaluator (`createNetEvaluator`) and one trainer (`src/train/`) then work
 * for every game, so the bot and the trainer score turns the same way.
 *
 * The first layer is sparse: most inputs are 0, so the hidden sums only add
 * the weight rows of the inputs that are not 0.
 */

import type { GameState, PlayerId, RuleSet, Turn, Variant } from '@tavli/engine';
import { opponent } from '@tavli/engine';

import type { Evaluation, Evaluator, TurnScore } from '../types';
import { decodeFloat32 } from './float-codec';

/** Number of outputs: P(win), P(win a double), P(lose a double). */
export const NET_OUTPUTS = 3;

/** A typed array of weights: Float32 to ship and play, Float64 to train. */
export type NetArray = Float32Array | Float64Array;

/**
 * The weights of a net with one hidden layer.
 *
 * - `w1[i * hidden + h]`: from input `i` to hidden unit `h` (rows by input,
 *   so a sparse input adds one row);
 * - `b1[h]`, `w2[k * hidden + h]` (hidden `h` to output `k`), `b2[k]`.
 */
export interface Net {
  readonly inputs: number;
  readonly hidden: number;
  readonly w1: NetArray;
  readonly b1: NetArray;
  readonly w2: NetArray;
  readonly b2: NetArray;
}

/** The shipped form of a net: the sizes and the weights as base64 Float32. */
export interface NetFile {
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

/** Room for `size` inputs (the net's input count). */
export function createSparseInput(size: number): SparseInput {
  return { index: new Int32Array(size), value: new Float64Array(size), count: 0 };
}

/** Adds one input that is not 0. */
export function pushInput(input: SparseInput, index: number, value: number): void {
  input.index[input.count] = index;
  input.value[input.count] = value;
  input.count += 1;
}

/**
 * Adds the TD-Gammon units for `n` checkers on one point, from input
 * `base`: n ≥ 1, n ≥ 2, n ≥ 3, and (n − 3) / 2 for n > 3.
 */
export function pushPointUnits(input: SparseInput, base: number, n: number): void {
  if (n === 0) return;
  pushInput(input, base, 1);
  if (n > 1) pushInput(input, base + 1, 1);
  if (n > 2) pushInput(input, base + 2, 1);
  if (n > 3) pushInput(input, base + 3, (n - 3) / 2);
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * The forward pass. Writes the hidden activations into `hiddenOut` and the
 * 3 outputs into `out`.
 */
export function forward(
  net: Net,
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
  for (let o = 0; o < NET_OUTPUTS; o += 1) {
    let sum = b2[o] ?? 0;
    const row = o * size;
    for (let h = 0; h < size; h += 1) sum += (w2[row + h] ?? 0) * (hiddenOut[h] ?? 0);
    out[o] = sigmoid(sum);
  }
}

/** Turns the 3 outputs into an `Evaluation`. A double is at most the win (or loss) chance. */
export function toEvaluation(win: number, winDouble: number, loseDouble: number): Evaluation {
  const wd = Math.min(win, winDouble);
  const ld = Math.min(1 - win, loseDouble);
  return { win, winDouble: wd, loseDouble: ld, equity: 2 * win - 1 + wd - ld };
}

/** Builds a `Net` from its shipped form. Throws if the sizes do not match `inputs`. */
export function loadNet(file: NetFile, inputs: number): Net {
  const { hidden } = file;
  if (file.inputs !== inputs) {
    throw new RangeError(`net "${file.id}" has ${file.inputs} inputs, the code needs ${inputs}`);
  }
  const all = decodeFloat32(file.data);
  const sizes = [inputs * hidden, hidden, NET_OUTPUTS * hidden, NET_OUTPUTS];
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

export function createScratch(net: Net): NetScratch {
  return {
    input: createSparseInput(net.inputs),
    hidden: new Float64Array(net.hidden),
    out: new Float64Array(NET_OUTPUTS),
  };
}

/**
 * What a game gives the net code. `S` is the game's fast side array (one
 * per player, in its own numbering). `C` is what the rules fix for a whole
 * game (for example the Fevga runner target), read once per state.
 */
export interface NetGame<S, C> {
  /** The engine variant (rules, legal turns). */
  readonly variant: Variant;
  /** Number of net inputs. */
  readonly inputs: number;
  context(rules: RuleSet): C;
  sideOf(state: GameState, player: PlayerId): S;
  /** Plays a turn on copies of the sides: `[mover, other]` after the turn. */
  play(mover: S, other: S, turn: Turn): [S, S];
  /**
   * The points for the mover if the turn ends the game (0 for a draw,
   * below 0 for a loss), else `null`.
   */
  endPoints(mover: S, other: S, context: C): number | null;
  /** True when the net scores this position. Else `fallback` does. */
  usesNet(roller: S, waiter: S): boolean;
  /** Writes the inputs of a position the net scores into `input` (it is reused). */
  encode(roller: S, waiter: S, context: C, input: SparseInput): void;
  /** The heuristic's evaluation: for the positions the net does not score. */
  fallback(roller: S, waiter: S, context: C): Evaluation;
}

/** Scores two sides (`roller` is to roll): the net, or the heuristic where the net does not play. */
export function evaluateNet<S, C>(
  game: NetGame<S, C>,
  net: Net,
  roller: S,
  waiter: S,
  context: C,
  scratch: NetScratch,
): Evaluation {
  if (!game.usesNet(roller, waiter)) return game.fallback(roller, waiter, context);
  game.encode(roller, waiter, context, scratch.input);
  forward(net, scratch.input, scratch.hidden, scratch.out);
  return toEvaluation(scratch.out[0] ?? 0, scratch.out[1] ?? 0, scratch.out[2] ?? 0);
}

/** One scored turn, with the sides after it (the trainer needs them). */
export interface NetCandidate<S> {
  /** The mover's side after the turn. */
  readonly mine: S;
  /** The other side after the turn: the next roller. */
  readonly theirs: S;
  /** The points for the mover if the turn ends the game, else `null`. */
  readonly points: number | null;
  /** The next roller's evaluation (`null` when the game is over). */
  readonly next: Evaluation | null;
  readonly score: TurnScore;
}

/**
 * Scores each turn for the mover (1-ply), on the fast board: the true
 * points if the turn ends the game, else minus the next roller's equity.
 * The bot (`createNetEvaluator`) and the trainer both use it.
 */
export function scoreNetCandidates<S, C>(
  game: NetGame<S, C>,
  net: Net,
  me: S,
  them: S,
  context: C,
  turns: readonly Turn[],
  scratch: NetScratch,
): NetCandidate<S>[] {
  return turns.map((turn) => {
    const [mine, theirs] = game.play(me, them, turn);
    const points = game.endPoints(mine, theirs, context);
    if (points !== null) {
      return { mine, theirs, points, next: null, score: { score: points, gameOver: true } };
    }
    const next = evaluateNet(game, net, theirs, mine, context, scratch);
    return { mine, theirs, points, next, score: { score: -next.equity, gameOver: false } };
  });
}

/**
 * Builds the evaluator for a net. `net` may be a function: it then runs on
 * the first use, so the app does not decode the weights at start-up.
 */
export function createNetEvaluator<S, C>(
  game: NetGame<S, C>,
  net: Net | (() => Net),
  id: string,
): Evaluator {
  let loaded: { net: Net; scratch: NetScratch } | undefined;
  const get = (): { net: Net; scratch: NetScratch } => {
    if (loaded === undefined) {
      const value = typeof net === 'function' ? net() : net;
      loaded = { net: value, scratch: createScratch(value) };
    }
    return loaded;
  };
  return {
    id,
    variant: game.variant.id,
    evaluate(state: GameState): Evaluation {
      const { net: value, scratch } = get();
      return evaluateNet(
        game,
        value,
        game.sideOf(state, state.toMove),
        game.sideOf(state, opponent(state.toMove)),
        game.context(state.rules),
        scratch,
      );
    },
    scoreTurns(state: GameState, turns: readonly Turn[]): TurnScore[] {
      const { net: value, scratch } = get();
      const me = game.sideOf(state, state.toMove);
      const them = game.sideOf(state, opponent(state.toMove));
      return scoreNetCandidates(
        game,
        value,
        me,
        them,
        game.context(state.rules),
        turns,
        scratch,
      ).map((c) => c.score);
    },
  };
}
