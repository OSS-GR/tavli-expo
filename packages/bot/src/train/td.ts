/**
 * Training for the nets: TD(λ) self-play (bot-ai.md, section 5.1). It works
 * for every game that has a `NetGame` (`portesNetGame`, `plakotoNetGame`,
 * `fevgaNetGame`).
 *
 * Dev only. The app never imports this folder, and CI only runs its small
 * unit tests. The Node entry point is `scripts/train.ts`.
 *
 * How one game trains the net:
 *
 * 1. The net plays itself, greedy 1-ply (the dice give enough variety). It
 *    plays with the engine (`legalTurns`, `applyTurn`) and scores the turns
 *    on the fast board arrays with `scoreNetCandidates`, the same code as
 *    the bot's evaluator. `pickTurn` (temperature 0) picks the turn, as the
 *    bot does.
 * 2. The game stops at the end (the true result), or at the first position
 *    the net does not score (`usesNet` is false: a race, or a pinned
 *    Plakoto mother). The heuristic's value of that position is then the
 *    target. So the net never trains on a position it does not score.
 * 3. Each position before a roll gets a λ-return target, computed backwards
 *    from the end: `G_t = flip((1 − λ)·V_{t+1} + λ·G_{t+1})`. `V_{t+1}` is
 *    the value the net gave the chosen turn during the game. `flip` swaps
 *    the view (the other player rolls next).
 * 4. One gradient step per position, with cross-entropy loss on the 3
 *    sigmoid outputs (the error at an output is just `out − target`). The
 *    first layer is sparse, so a step only touches the rows of the inputs
 *    that are not 0.
 *
 * A game that runs longer than `maxTurns` is dropped (no step).
 */

import { createSeededRng, opponent, rollDice } from '@tavli/engine';
import type { GameState, PlayerId, Rng, Variant } from '@tavli/engine';

import { pickTurn } from '../create-bot';
import { encodeFloat32 } from '../evaluators/float-codec';
import { NET_OUTPUTS, createScratch, forward, scoreNetCandidates } from '../evaluators/net';
import type { Net, NetFile, NetGame, NetScratch } from '../evaluators/net';
import { randomUnit } from '../random';

/** A net that training can change (Float64 weights). */
export interface TrainableNet extends Net {
  readonly w1: Float64Array;
  readonly b1: Float64Array;
  readonly w2: Float64Array;
  readonly b2: Float64Array;
}

/** A new net with small random weights from `rng`. */
export function createTrainableNet(inputs: number, hidden: number, rng: Rng): TrainableNet {
  const uniform = (scale: number): number => (randomUnit(rng) * 2 - 1) * scale;
  const w1 = new Float64Array(inputs * hidden).map(() => uniform(0.1));
  const b1 = new Float64Array(hidden).map(() => uniform(0.1));
  const w2 = new Float64Array(NET_OUTPUTS * hidden).map(() => uniform(0.1));
  const b2 = new Float64Array(NET_OUTPUTS);
  return { inputs, hidden, w1, b1, w2, b2 };
}

/** A trainable copy of any net (for example one loaded from a file). */
export function toTrainable(net: Net): TrainableNet {
  return {
    inputs: net.inputs,
    hidden: net.hidden,
    w1: Float64Array.from(net.w1),
    b1: Float64Array.from(net.b1),
    w2: Float64Array.from(net.w2),
    b2: Float64Array.from(net.b2),
  };
}

/** The shipped form of a net (Float32, base64). `game` is the variant id it was trained for. */
export function toNetFile(net: Net, id: string, notes?: string, game?: string): NetFile {
  const all = new Float32Array(net.w1.length + net.b1.length + net.w2.length + net.b2.length);
  let at = 0;
  for (const part of [net.w1, net.b1, net.w2, net.b2]) {
    all.set(part, at);
    at += part.length;
  }
  const file: NetFile = {
    id,
    ...(game === undefined ? {} : { game }),
    inputs: net.inputs,
    hidden: net.hidden,
    data: encodeFloat32(all),
  };
  return notes === undefined ? file : { ...file, notes };
}

/** Scratch space for `trainStep`. */
export interface TrainScratch extends NetScratch {
  readonly delta: Float64Array;
}

export function createTrainScratch(net: Net): TrainScratch {
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
  for (let o = 0; o < NET_OUTPUTS; o += 1) {
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

/** [P(win), P(win a double), P(lose a double)] from the view of one player. */
export type Triple = [number, number, number];

/** The same chances from the other player's view. */
function flip(v: Triple): Triple {
  return [1 - v[0], v[2], v[1]];
}

/**
 * The target for a game end, from the mover's view: 2+ points is a double
 * win, 1 a single win, 0 a draw (half a win), below 0 a loss.
 */
export function endTriple(points: number): Triple {
  if (points >= 2) return [1, 1, 0];
  if (points >= 1) return [1, 0, 0];
  if (points === 0) return [0.5, 0, 0];
  return points <= -2 ? [0, 0, 1] : [0, 0, 0];
}

export interface EpisodeOptions {
  readonly lambda: number;
  readonly alpha: number;
  /** Who rolls first. */
  readonly startingPlayer: PlayerId;
  /** Drop the game after this many turns (default 1,000). */
  readonly maxTurns?: number;
}

export interface EpisodeResult {
  /** Turns played until the end (or until the net stopped scoring). */
  readonly turns: number;
  /** True if the game stopped at a position the net does not score (a race, a pinned mother). */
  readonly handOff: boolean;
  /** True if the game ran past `maxTurns`: it was dropped, with no step. */
  readonly dropped: boolean;
  /** Mean squared error of the win output over the game, before each step. */
  readonly error: number;
}

/**
 * Answers every question the state waits for with "play on" (or the first
 * choice when there is no "play on"). In Plakoto (`offerConcede`), with the
 * default `motherCheckTiming: "afterEachMove"`, a turn that pins the mother
 * and then leaves it asks the question too. Playing on never loses more
 * than resigning, so self-play always plays on.
 */
export function playOn(variant: Variant, state: GameState): GameState {
  let next = state;
  for (let prompt = variant.prompt?.(next) ?? null; prompt !== null;) {
    if (variant.answerPrompt === undefined) break;
    const choice = prompt.choices.includes('playOn') ? 'playOn' : (prompt.choices[0] ?? '');
    next = variant.answerPrompt(next, prompt.player, choice);
    prompt = variant.prompt?.(next) ?? null;
  }
  return next;
}

/** The default `maxTurns`: far more than a real game (Portes, Plakoto and Fevga games take 50–120 turns). */
export const DEFAULT_MAX_TURNS = 1000;

/**
 * Plays one self-play game with the net and trains on it. `rng` gives the
 * dice and breaks ties.
 */
export function trainEpisode<S, C>(
  game: NetGame<S, C>,
  net: TrainableNet,
  rng: Rng,
  options: EpisodeOptions,
  scratch: TrainScratch = createTrainScratch(net),
): EpisodeResult {
  const { variant } = game;
  let state: GameState = variant.initialState({ startingPlayer: options.startingPlayer });
  const context = game.context(state.rules);
  let roller = game.sideOf(state, state.toMove);
  let waiter = game.sideOf(state, opponent(state.toMove));
  const positions: [S, S][] = [];
  // values[t]: the net's value of position t + 1, from the view of its roller.
  const values: Triple[] = [];
  let last: Triple = [0.5, 0, 0];
  let handOff = false;
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS;
  for (;;) {
    if (positions.length >= maxTurns) {
      return { turns: positions.length, handOff: false, dropped: true, error: 0 };
    }
    const dice = rollDice(rng);
    const rolled: GameState = { ...state, dice };
    const turns = variant.legalTurns(rolled, dice);
    const candidates = scoreNetCandidates(game, net, roller, waiter, context, turns, scratch);
    const indices = candidates.map((_, i) => i);
    const chosen = pickTurn(
      indices,
      candidates.map((c) => c.score),
      0,
      rng,
    );
    const pick = candidates[chosen];
    const turn = turns[chosen];
    if (pick === undefined || turn === undefined) throw new Error('no turn chosen');
    positions.push([roller, waiter]);
    if (pick.points !== null || pick.next === null) {
      last = endTriple(pick.points ?? 0);
      break;
    }
    const value: Triple = [pick.next.win, pick.next.winDouble, pick.next.loseDouble];
    if (!game.usesNet(pick.theirs, pick.mine, context)) {
      handOff = true;
      last = flip(value);
      break;
    }
    values.push(value);
    state = playOn(variant, variant.applyTurn(rolled, turn));
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
    game.encode(position[0], position[1], context, scratch.input);
    error += trainStep(net, target, options.alpha, scratch);
  }
  return {
    turns: positions.length,
    handOff,
    dropped: false,
    error: error / Math.max(1, positions.length),
  };
}

/** A position the net scores, before a roll, and the heuristic's chances for its roller. */
export interface LabelledPosition<S> {
  readonly roller: S;
  readonly waiter: S;
  readonly target: Triple;
}

/**
 * Positions the net scores, from heuristic self-play (greedy 1-ply with the
 * heuristic, a little noise), labelled by the heuristic. For the supervised
 * warm start. Uses the variant's default rules.
 */
export function heuristicPositions<S, C>(
  game: NetGame<S, C>,
  count: number,
  seed: number,
): LabelledPosition<S>[] {
  const rng = createSeededRng(seed);
  const { variant } = game;
  const out: LabelledPosition<S>[] = [];
  let played = 0;
  while (out.length < count) {
    let state = variant.initialState({ startingPlayer: played % 2 === 0 ? 'white' : 'black' });
    played += 1;
    const context = game.context(state.rules);
    let roller = game.sideOf(state, state.toMove);
    let waiter = game.sideOf(state, opponent(state.toMove));
    for (let turnCount = 0; turnCount < DEFAULT_MAX_TURNS; turnCount += 1) {
      if (out.length >= count || !game.usesNet(roller, waiter, context)) break;
      const e = game.fallback(roller, waiter, context);
      out.push({ roller, waiter, target: [e.win, e.winDouble, e.loseDouble] });
      const dice = rollDice(rng);
      const rolled: GameState = { ...state, dice };
      const turns = variant.legalTurns(rolled, dice);
      let bestScore = -Infinity;
      let bestIndex = 0;
      let next: [S, S] = [roller, waiter];
      let ended = false;
      turns.forEach((turn, i) => {
        const [mine, theirs] = game.play(roller, waiter, turn);
        const points = game.endPoints(mine, theirs, context);
        const score =
          points !== null
            ? points + 3
            : -game.fallback(theirs, mine, context).equity + (randomUnit(rng) - 0.5) * 0.02;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
          next = [mine, theirs];
          ended = points !== null;
        }
      });
      const turn = turns[bestIndex];
      if (turn === undefined || ended) break;
      state = playOn(variant, variant.applyTurn(rolled, turn));
      roller = next[1];
      waiter = next[0];
    }
  }
  return out;
}

/** One pass of supervised steps over `positions`, in a random order. Returns the mean win error. */
export function supervisedEpoch<S, C>(
  game: NetGame<S, C>,
  net: TrainableNet,
  positions: readonly LabelledPosition<S>[],
  context: C,
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
    game.encode(p.roller, p.waiter, context, scratch.input);
    error += trainStep(net, p.target, alpha, scratch);
  }
  return error / Math.max(1, positions.length);
}

/** Checks a side array (for tests): 15 checkers in indexes 0–`last`, none negative. */
export function isValidSide(side: readonly number[], last = 25): boolean {
  let total = 0;
  for (let i = 0; i <= last; i += 1) {
    const n = side[i] ?? 0;
    if (n < 0) return false;
    total += n;
  }
  return total === 15;
}
