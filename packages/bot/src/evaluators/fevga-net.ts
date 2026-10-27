/**
 * `fevga-net`: a small neural net for Fevga, trained by TD(λ) self-play
 * like the Portes net (`portes-net.ts`; the shared code is in `net.ts`, the
 * training in `src/train/`).
 *
 * It scores a position before the roll, from the view of the player to
 * roll. The net only scores **contact** positions (some checker still has
 * an opponent checker in front of it). A pure race and a finished game use
 * the Fevga heuristic (`evaluateFevgaSides`: the race code and the exact
 * bear-off table).
 *
 * The net: `FEVGA_NET_INPUTS` inputs → one hidden layer (sigmoid) → 3
 * outputs (sigmoid): P(win), P(win a diplo), P(lose a diplo).
 *
 * Inputs (`encodeFevga`), the roller's side first, then the waiter's, each
 * in its own numbering. Fevga has no bar and no pins:
 *
 * - per own point 1–24, 4 inputs (TD-Gammon style): n ≥ 1, n ≥ 2, n ≥ 3,
 *   and (n − 3) / 2 for n > 3 (192 in all);
 * - borne off / 15 (2), pip counts / 100 (2);
 * - the heuristic's block features for each side (`sideFeatures`), 10 each
 *   (20): the prime in front of the side and the checkers it traps, the
 *   points ahead, blocked landings, dice with no move, the runner state
 *   (locked, and how far the runner still has to go), home points, the
 *   checkers still on the start, stacked checkers;
 * - the heuristic's contact score in logits / 4 (`contactScore`) (1).
 *
 * The runner rule and the prime bans are in the engine's legal turns. The
 * runner inputs use the runner target of the game's rules.
 */

import { fevga } from '@tavli/engine';

import type { Evaluator } from '../types';
import { fevgaHasContact, fevgaSideOf, playFevgaTurn } from './fevga-board';
import {
  FEVGA_DEFAULT_WEIGHTS,
  contactScore,
  evaluateFevgaSides,
  runnerTargetOf,
  sideFeatures,
} from './fevga-heuristic';
import { at, createNetEvaluator, loadNet, pushInput, pushPointUnits } from './net';
import type { Net, NetFile, NetGame, SparseInput } from './net';
import { OFF, pips } from './portes-board';
import type { Side } from './portes-board';
import { FEVGA_NET_V1 } from './fevga-net-weights';

/** Number of inputs. */
export const FEVGA_NET_INPUTS = 217;

/** The scale of each `sideFeatures` value (the last one, checkers off, is not used). */
const FEATURE_SCALE = [1, 1, 1 / 12, 1 / 6, 1 / 6, 1, 1, 1 / 6, 1 / 15, 1 / 15] as const;

/** Writes the inputs of a contact position into `input` (it is reused). */
export function encodeFevga(
  roller: Side,
  waiter: Side,
  target: number | null,
  input: SparseInput,
): void {
  input.count = 0;
  for (let s = 0; s < 2; s += 1) {
    const side = s === 0 ? roller : waiter;
    const other = s === 0 ? waiter : roller;
    for (let p = 1; p <= 24; p += 1) pushPointUnits(input, s * 96 + (p - 1) * 4, at(side, p));
    if (at(side, OFF) > 0) pushInput(input, 192 + s, at(side, OFF) / 15);
    pushInput(input, 194 + s, pips(side) / 100);
    const features = sideFeatures(side, other, target, FEVGA_DEFAULT_WEIGHTS.primeShape);
    for (let f = 0; f < FEATURE_SCALE.length; f += 1) {
      const value = at(features, f) * (FEATURE_SCALE[f] ?? 0);
      if (value !== 0) pushInput(input, 196 + s * 10 + f, value);
    }
  }
  pushInput(input, 216, contactScore(roller, waiter, target, FEVGA_DEFAULT_WEIGHTS) / 4);
}

/** Fevga for the shared net code. The context is the runner target (`runnerTargetOf`). */
export const fevgaNetGame: NetGame<Side, number | null> = {
  variant: fevga,
  inputs: FEVGA_NET_INPUTS,
  context: runnerTargetOf,
  sideOf: fevgaSideOf,
  play: (mover, other, turn) => [playFevgaTurn(mover, turn), other],
  // fevga.md, "Winning & scoring": 2 points if the loser has borne off nothing.
  endPoints: (mover, other) => (at(mover, OFF) === 15 ? (at(other, OFF) === 0 ? 2 : 1) : null),
  usesNet: (roller, waiter) =>
    at(roller, OFF) < 15 && at(waiter, OFF) < 15 && fevgaHasContact(roller, waiter),
  encode: encodeFevga,
  fallback: (roller, waiter, target) =>
    evaluateFevgaSides(roller, waiter, target, FEVGA_DEFAULT_WEIGHTS),
};

/** Builds a Fevga net from its shipped form. Throws if the sizes do not match. */
export function loadFevgaNet(file: NetFile): Net {
  return loadNet(file, FEVGA_NET_INPUTS);
}

/** The evaluator for a Fevga net (or a function that loads it on first use). */
export function createFevgaNetEvaluator(net: Net | (() => Net), id: string): Evaluator {
  return createNetEvaluator(fevgaNetGame, net, id);
}

let shipped: Net | undefined;

/** The shipped net (`FEVGA_NET_V1`), decoded on the first call. */
export function shippedFevgaNet(): Net {
  shipped ??= loadFevgaNet(FEVGA_NET_V1);
  return shipped;
}

/** The shipped net as an evaluator, for the hard level. */
export const fevgaNet: Evaluator = createFevgaNetEvaluator(shippedFevgaNet, FEVGA_NET_V1.id);
