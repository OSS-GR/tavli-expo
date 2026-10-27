/**
 * `portes-net`: a small neural net for Portes, trained by TD(λ) self-play
 * (docs/architecture/bot-ai.md, section 5; the shared net code is in
 * `net.ts`, the training code in `src/train/`).
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
 */

import type { GameState, Turn } from '@tavli/engine';
import { opponent, portes } from '@tavli/engine';

import type { Evaluation, Evaluator, TurnScore } from '../types';
import {
  NET_OUTPUTS,
  createNetEvaluator,
  createScratch,
  createSparseInput as createInput,
  evaluateNet,
  loadNet,
  pushInput,
  pushPointUnits,
  scoreNetCandidates,
} from './net';
import type { Net, NetFile, NetGame, NetScratch, SparseInput } from './net';
import { BAR, OFF, hasContact, pips, playTurn, portesTurnPoints, sideOf } from './portes-board';
import type { Side } from './portes-board';
import { PORTES_DEFAULT_WEIGHTS, contactScore, evaluateSides } from './portes-heuristic';
import { PORTES_NET_V1 } from './portes-net-weights';
import { countShots } from './shots';

export { createScratch, forward, toEvaluation } from './net';
export type { NetArray, NetScratch, SparseInput } from './net';

/** Number of inputs. */
export const PORTES_NET_INPUTS = 201;
/** Number of outputs: P(win), P(win a diplo), P(lose a diplo). */
export const PORTES_NET_OUTPUTS = NET_OUTPUTS;

/** The weights of a net with one hidden layer (`net.ts`). */
export type PortesNet = Net;
/** The shipped form of a net (`net.ts`). */
export type PortesNetFile = NetFile;

/** Room for the Portes inputs. */
export function createSparseInput(): SparseInput {
  return createInput(PORTES_NET_INPUTS);
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
    for (let p = 1; p <= 24; p += 1) pushPointUnits(input, base + (p - 1) * 4, at(side, p));
  }
  if (at(roller, BAR) > 0) pushInput(input, 192, at(roller, BAR) / 2);
  if (at(waiter, BAR) > 0) pushInput(input, 193, at(waiter, BAR) / 2);
  if (at(roller, OFF) > 0) pushInput(input, 194, at(roller, OFF) / 15);
  if (at(waiter, OFF) > 0) pushInput(input, 195, at(waiter, OFF) / 15);
  pushInput(input, 196, pips(roller) / 100);
  pushInput(input, 197, pips(waiter) / 100);
  const rollerShots = countShots(roller, waiter).any;
  if (rollerShots > 0) pushInput(input, 198, rollerShots / 36);
  const waiterShots = countShots(waiter, roller).any;
  if (waiterShots > 0) pushInput(input, 199, waiterShots / 36);
  pushInput(input, 200, contactScore(roller, waiter, PORTES_DEFAULT_WEIGHTS) / 4);
}

/** Portes for the shared net code. The context is `backgammonScores3`. */
export const portesNetGame: NetGame<Side, boolean> = {
  variant: portes,
  inputs: PORTES_NET_INPUTS,
  context: (rules) => rules.scoring.backgammonScores3,
  sideOf,
  play: playTurn,
  endPoints: portesTurnPoints,
  usesNet: (roller, waiter) =>
    at(roller, OFF) < 15 && at(waiter, OFF) < 15 && hasContact(roller, waiter),
  encode: (roller, waiter, _triple, input) => encodePortes(roller, waiter, input),
  fallback: (roller, waiter) => evaluateSides(roller, waiter, PORTES_DEFAULT_WEIGHTS),
};

/** Builds a `PortesNet` from its shipped form. Throws if the sizes do not match. */
export function loadPortesNet(file: PortesNetFile): PortesNet {
  return loadNet(file, PORTES_NET_INPUTS);
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
  return evaluateNet(portesNetGame, net, roller, waiter, false, scratch);
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
  return scoreNetCandidates(portesNetGame, net, me, them, triple, turns, scratch).map(
    (c) => c.score,
  );
}

/**
 * Builds the evaluator for a net. `net` may be a function: it then runs on
 * the first use, so the app does not decode the weights at start-up.
 */
export function createPortesNetEvaluator(
  net: PortesNet | (() => PortesNet),
  id: string,
): Evaluator {
  return createNetEvaluator(portesNetGame, net, id);
}

let shipped: PortesNet | undefined;

/** The shipped net (`PORTES_NET_V1`), decoded on the first call. */
export function shippedPortesNet(): PortesNet {
  shipped ??= loadPortesNet(PORTES_NET_V1);
  return shipped;
}

/** The shipped net as an evaluator, for the hard level. */
export const portesNet: Evaluator = createPortesNetEvaluator(shippedPortesNet, PORTES_NET_V1.id);
