/**
 * Training for the Portes net: TD(λ) self-play (bot-ai.md, section 5.1).
 *
 * Dev only. The app never imports this folder, and CI only runs its small
 * unit tests. The Node entry point is `scripts/train.ts`.
 *
 * How one game trains the net:
 *
 * 1. The net plays itself, greedy 1-ply (the dice give enough variety). It
 *    plays with the engine (`legalTurns`, `applyTurn`) and scores the turns
 *    on the fast board arrays, like the evaluator.
 * 2. The game stops when contact breaks (the race heuristic then gives the
 *    value) or when a player bears off the last checker (the true result).
 *    The net never scores a race, so it does not train on one.
 * 3. Each position before a roll gets a λ-return target, computed backwards
 *    from the end: `G_t = flip((1 − λ)·V_{t+1} + λ·G_{t+1})`. `V_{t+1}` is
 *    the value the net gave the chosen turn during the game. `flip` swaps
 *    the view (the other player rolls next).
 * 4. One gradient step per position, with cross-entropy loss on the 3
 *    sigmoid outputs (the error at an output is just `out − target`). The
 *    first layer is sparse, so a step only touches the rows of the inputs
 *    that are not 0.
 */

import { createSeededRng, opponent, portes, rollDice } from '@tavli/engine';
import type { GameState, PlayerId, Rng } from '@tavli/engine';

import { BAR, OFF, hasContact, playTurn, sideOf } from '../evaluators/portes-board';
import type { Side } from '../evaluators/portes-board';
import { PORTES_DEFAULT_WEIGHTS, evaluateSides } from '../evaluators/portes-heuristic';
import {
  PORTES_NET_INPUTS,
  PORTES_NET_OUTPUTS,
  createScratch,
  encodePortes,
  evaluateNetSides,
  forward,
} from '../evaluators/portes-net';
import type { NetScratch, PortesNet, PortesNetFile } from '../evaluators/portes-net';
import { encodeFloat32 } from '../evaluators/float-codec';
import { pickOne, randomUnit } from '../random';

/** A net that training can change (Float64 weights). */
export interface TrainableNet extends PortesNet {
  readonly w1: Float64Array;
  readonly b1: Float64Array;
  readonly w2: Float64Array;
  readonly b2: Float64Array;
}

/** A new net with small random weights from `rng`. */
export function createTrainableNet(hidden: number, rng: Rng): TrainableNet {
  const inputs = PORTES_NET_INPUTS;
  const uniform = (scale: number): number => (randomUnit(rng) * 2 - 1) * scale;
  const w1 = new Float64Array(inputs * hidden).map(() => uniform(0.1));
  const b1 = new Float64Array(hidden).map(() => uniform(0.1));
  const w2 = new Float64Array(PORTES_NET_OUTPUTS * hidden).map(() => uniform(0.1));
  const b2 = new Float64Array(PORTES_NET_OUTPUTS);
  return { inputs, hidden, w1, b1, w2, b2 };
}

/** A trainable copy of any net (for example one loaded from a file). */
export function toTrainable(net: PortesNet): TrainableNet {
  return {
    inputs: net.inputs,
    hidden: net.hidden,
    w1: Float64Array.from(net.w1),
    b1: Float64Array.from(net.b1),
    w2: Float64Array.from(net.w2),
    b2: Float64Array.from(net.b2),
  };
}

/** The shipped form of a net (Float32, base64). */
export function toNetFile(net: PortesNet, id: string, notes?: string): PortesNetFile {
  const all = new Float32Array(net.w1.length + net.b1.length + net.w2.length + net.b2.length);
  let at = 0;
  for (const part of [net.w1, net.b1, net.w2, net.b2]) {
    all.set(part, at);
    at += part.length;
  }
  const file = { id, inputs: net.inputs, hidden: net.hidden, data: encodeFloat32(all) };
  return notes === undefined ? file : { ...file, notes };
}

/** Scratch space for `trainStep`. */
export interface TrainScratch extends NetScratch {
  readonly delta: Float64Array;
}

export function createTrainScratch(net: PortesNet): TrainScratch {
  return { ...createScratch(net), delta: new Float64Array(net.hidden) };
}

/**
 * One gradient step toward `target` (3 values) for the position in
 * `scratch.input`. Cross-entropy loss. Returns the squared error of the
 * win output before the step.
 */
export function trainStep(
  net: TrainableNet,
  target: ArrayLike<number>,
  alpha: number,
  scratch: TrainScratch,
): number {
  const { hidden: size, w1, b1, w2, b2 } = net;
  const { input, hidden, out, delta } = scratch;
  forward(net, input, hidden, out);
  delta.fill(0);
  for (let o = 0; o < PORTES_NET_OUTPUTS; o += 1) {
    const error = (out[o] ?? 0) - (target[o] ?? 0);
    const row = o * size;
    for (let h = 0; h < size; h += 1) {
      delta[h] = (delta[h] ?? 0) + error * (w2[row + h] ?? 0);
      w2[row + h] = (w2[row + h] ?? 0) - alpha * error * (hidden[h] ?? 0);
    }
    b2[o] = (b2[o] ?? 0) - alpha * error;
  }
  for (let h = 0; h < size; h += 1) {
    const a = hidden[h] ?? 0;
    delta[h] = (delta[h] ?? 0) * a * (1 - a);
    b1[h] = (b1[h] ?? 0) - alpha * (delta[h] ?? 0);
  }
  for (let k = 0; k < input.count; k += 1) {
    const v = input.value[k] ?? 0;
    const row = (input.index[k] ?? 0) * size;
    for (let h = 0; h < size; h += 1) {
      w1[row + h] = (w1[row + h] ?? 0) - alpha * v * (delta[h] ?? 0);
    }
  }
  const winError = (out[0] ?? 0) - (target[0] ?? 0);
  return winError * winError;
}

/** [P(win), P(win a diplo), P(lose a diplo)] from the view of one player. */
export type Triple = [number, number, number];

/** The same chances from the other player's view. */
function flip(v: Triple): Triple {
  return [1 - v[0], v[2], v[1]];
}

export interface EpisodeOptions {
  readonly lambda: number;
  readonly alpha: number;
  /** Who rolls first. */
  readonly startingPlayer: PlayerId;
}

export interface EpisodeResult {
  /** Turns played until the end (or until contact broke). */
  readonly turns: number;
  /** True if contact broke before the end. */
  readonly race: boolean;
  /** Mean squared error of the win output over the game, before each step. */
  readonly error: number;
}

/**
 * Plays one self-play game with the net and trains on it. `rng` gives the
 * dice and breaks ties.
 */
export function trainEpisode(
  net: TrainableNet,
  rng: Rng,
  options: EpisodeOptions,
  scratch: TrainScratch = createTrainScratch(net),
): EpisodeResult {
  let state: GameState = portes.initialState({ startingPlayer: options.startingPlayer });
  let roller: Side = sideOf(state, state.toMove);
  let waiter: Side = sideOf(state, opponent(state.toMove));
  const positions: [Side, Side][] = [];
  // values[t]: the net's value of position t + 1, from the view of its roller.
  const values: Triple[] = [];
  let last: Triple = [0.5, 0, 0];
  let race = false;
  for (;;) {
    const dice = rollDice(rng);
    const rolled: GameState = { ...state, dice };
    const turns = portes.legalTurns(rolled, dice);
    let bestScore = -Infinity;
    let best: number[] = [];
    const candidates: { mine: Side; theirs: Side; value: Triple; end: number }[] = [];
    turns.forEach((turn, i) => {
      const [mine, theirs] = playTurn(roller, waiter, turn);
      let score: number;
      let value: Triple;
      let end = 0;
      if ((mine[OFF] ?? 0) === 15) {
        end = (theirs[OFF] ?? 0) === 0 ? 2 : 1;
        score = end;
        value = [0, 0, end === 2 ? 1 : 0];
      } else {
        const e = evaluateNetSides(net, theirs, mine, scratch);
        score = -e.equity;
        value = [e.win, e.winDouble, e.loseDouble];
      }
      candidates.push({ mine, theirs, value, end });
      if (score > bestScore + 1e-12) {
        bestScore = score;
        best = [i];
      } else if (Math.abs(score - bestScore) <= 1e-12) {
        best.push(i);
      }
    });
    const chosen = pickOne(rng, best);
    const pick = candidates[chosen];
    const turn = turns[chosen];
    if (pick === undefined || turn === undefined) throw new Error('no turn chosen');
    const bestValue = pick.value;
    positions.push([roller, waiter]);
    if (pick.end > 0) {
      last = [1, pick.end === 2 ? 1 : 0, 0];
      break;
    }
    if (!hasContact(pick.theirs, pick.mine)) {
      race = true;
      last = flip(bestValue);
      break;
    }
    values.push(bestValue);
    state = portes.applyTurn(rolled, turn);
    roller = pick.theirs;
    waiter = pick.mine;
  }

  // λ-returns, backwards from the end.
  const targets: Triple[] = new Array<Triple>(positions.length);
  let g: Triple = last;
  targets[positions.length - 1] = g;
  for (let t = positions.length - 2; t >= 0; t -= 1) {
    const v = values[t] ?? [0.5, 0, 0];
    const mix: Triple = [
      (1 - options.lambda) * v[0] + options.lambda * g[0],
      (1 - options.lambda) * v[1] + options.lambda * g[1],
      (1 - options.lambda) * v[2] + options.lambda * g[2],
    ];
    g = flip(mix);
    targets[t] = g;
  }

  let error = 0;
  for (let t = 0; t < positions.length; t += 1) {
    const position = positions[t];
    const target = targets[t];
    if (position === undefined || target === undefined) continue;
    encodePortes(position[0], position[1], scratch.input);
    error += trainStep(net, target, options.alpha, scratch);
  }
  return { turns: positions.length, race, error: error / Math.max(1, positions.length) };
}

/** A contact position before a roll, and the heuristic's chances for its roller. */
export interface LabelledPosition {
  readonly roller: Side;
  readonly waiter: Side;
  readonly target: Triple;
}

/**
 * Contact positions from heuristic self-play (greedy 1-ply with the
 * heuristic), labelled by the heuristic. For the supervised warm start.
 */
export function heuristicPositions(count: number, seed: number): LabelledPosition[] {
  const rng = createSeededRng(seed);
  const out: LabelledPosition[] = [];
  let game = 0;
  while (out.length < count) {
    let state = portes.initialState({ startingPlayer: game % 2 === 0 ? 'white' : 'black' });
    game += 1;
    let roller = sideOf(state, state.toMove);
    let waiter = sideOf(state, opponent(state.toMove));
    while (out.length < count && hasContact(roller, waiter)) {
      const e = evaluateSides(roller, waiter, PORTES_DEFAULT_WEIGHTS);
      out.push({ roller, waiter, target: [e.win, e.winDouble, e.loseDouble] });
      const dice = rollDice(rng);
      const rolled: GameState = { ...state, dice };
      const turns = portes.legalTurns(rolled, dice);
      let bestScore = -Infinity;
      let bestIndex = 0;
      let next: [Side, Side] = [roller, waiter];
      turns.forEach((turn, i) => {
        const [mine, theirs] = playTurn(roller, waiter, turn);
        const score =
          (mine[OFF] ?? 0) === 15
            ? 3
            : -evaluateSides(theirs, mine, PORTES_DEFAULT_WEIGHTS).equity +
              (randomUnit(rng) - 0.5) * 0.02;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
          next = [mine, theirs];
        }
      });
      const turn = turns[bestIndex];
      if (turn === undefined || (next[0][OFF] ?? 0) === 15) break;
      state = portes.applyTurn(rolled, turn);
      roller = next[1];
      waiter = next[0];
    }
  }
  return out;
}

/** One pass of supervised steps over `positions`, in a random order. Returns the mean win error. */
export function supervisedEpoch(
  net: TrainableNet,
  positions: readonly LabelledPosition[],
  alpha: number,
  rng: Rng,
  scratch: TrainScratch = createTrainScratch(net),
): number {
  const order = positions.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomUnit(rng) * (i + 1));
    const a = order[i] ?? 0;
    order[i] = order[j] ?? 0;
    order[j] = a;
  }
  let error = 0;
  for (const i of order) {
    const p = positions[i];
    if (p === undefined) continue;
    encodePortes(p.roller, p.waiter, scratch.input);
    error += trainStep(net, p.target, alpha, scratch);
  }
  return error / Math.max(1, positions.length);
}

/** Checks a side array (for tests): 15 checkers, none negative. */
export function isValidSide(side: Side): boolean {
  let total = 0;
  for (let i = OFF; i <= BAR; i += 1) {
    const n = side[i] ?? 0;
    if (n < 0) return false;
    total += n;
  }
  return total === 15;
}
