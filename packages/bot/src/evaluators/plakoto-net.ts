/**
 * `plakoto-net`: a small neural net for Plakoto, trained by TD(λ) self-play
 * like the Portes net (`portes-net.ts`; the shared code is in `net.ts`, the
 * training in `src/train/`).
 *
 * It scores a position before the roll, from the view of the player to
 * roll. The net only scores **contact** positions where **no mother is
 * pinned**. The Plakoto heuristic (`evaluatePlakotoSides`) scores the rest:
 *
 * - a race (no pin is possible any more) and a finished game: the race
 *   code and the exact bear-off table;
 * - a pinned mother: the game is nearly decided (the pinned side loses a
 *   double almost every time; README, "The mother question"). The
 *   heuristic's number for it is close to the true one, so the net does
 *   not have to learn it, and a training game stops there. This holds for
 *   every `motherRule`: `usesNet` reads only the board.
 *
 * The net: `PLAKOTO_NET_INPUTS` inputs → one hidden layer (sigmoid) → 3
 * outputs (sigmoid): P(win), P(win a double), P(lose a double).
 *
 * Inputs (`encodePlakoto`), the roller's side first, then the waiter's, each
 * in its own numbering:
 *
 * - per own point 1–24, 4 inputs (TD-Gammon style): n ≥ 1, n ≥ 2, n ≥ 3,
 *   and (n − 3) / 2 for n > 3 (192 in all);
 * - pin units: 1 when the side's checker on own point 1–24 is pinned
 *   (48). A pin of the waiter's checker is a pin the roller holds;
 * - a lone mother (one free checker left on own point 24), per side (2);
 * - borne off / 15 (2), pip counts / 100 (2);
 * - the rolls out of 36 that pin some checker, per side, and that pin the
 *   other side's mother (`plakoto-shots.ts`) (4);
 * - the heuristic's contact score in logits / 4 (`contactScore`) (1).
 */

import type { MotherRules } from '@tavli/engine';
import { plakoto } from '@tavli/engine';

import type { Evaluator } from '../types';
import { at, createNetEvaluator, loadNet, pushInput, pushPointUnits } from './net';
import type { Net, NetFile, NetGame, SparseInput } from './net';
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
import {
  PLAKOTO_DEFAULT_WEIGHTS,
  contactScore,
  evaluatePlakotoSides,
  plakotoTurnResult,
} from './plakoto-heuristic';
import { PLAKOTO_NET_V1 } from './plakoto-net-weights';
import { countPlakotoShots } from './plakoto-shots';
import { pips } from './portes-board';

/** Number of inputs. */
export const PLAKOTO_NET_INPUTS = 251;

/** Writes the inputs of a position the net scores into `input` (it is reused). */
export function encodePlakoto(roller: PlakotoSide, waiter: PlakotoSide, input: SparseInput): void {
  input.count = 0;
  for (let s = 0; s < 2; s += 1) {
    const side = s === 0 ? roller : waiter;
    for (let p = 1; p <= 24; p += 1) pushPointUnits(input, s * 96 + (p - 1) * 4, at(side, p));
    for (let p = 1; p <= 24; p += 1) {
      if (at(side, PINNED + p) === 1) pushInput(input, 192 + s * 24 + (p - 1), 1);
    }
    if (at(side, START) === 1 && at(side, PINNED + START) !== 1) pushInput(input, 240 + s, 1);
    if (at(side, OFF) > 0) pushInput(input, 242 + s, at(side, OFF) / 15);
    pushInput(input, 244 + s, pips(side) / 100);
  }
  const rollerShots = countPlakotoShots(roller, waiter);
  const waiterShots = countPlakotoShots(waiter, roller);
  if (rollerShots.any > 0) pushInput(input, 246, rollerShots.any / 36);
  if (waiterShots.any > 0) pushInput(input, 247, waiterShots.any / 36);
  if (at(rollerShots.perBlot, START) > 0) {
    pushInput(input, 248, at(rollerShots.perBlot, START) / 36);
  }
  if (at(waiterShots.perBlot, START) > 0) {
    pushInput(input, 249, at(waiterShots.perBlot, START) / 36);
  }
  pushInput(input, 250, contactScore(roller, waiter, PLAKOTO_DEFAULT_WEIGHTS) / 4);
}

/** Plakoto for the shared net code. The context is the mother rules. */
export const plakotoNetGame: NetGame<PlakotoSide, MotherRules> = {
  variant: plakoto,
  inputs: PLAKOTO_NET_INPUTS,
  context: (rules) => rules.mother,
  sideOf: plakotoSideOf,
  play: playPlakotoTurn,
  endPoints: plakotoTurnResult,
  usesNet: (roller, waiter) =>
    at(roller, OFF) < 15 &&
    at(waiter, OFF) < 15 &&
    !motherPinned(roller) &&
    !motherPinned(waiter) &&
    plakotoContact(roller, waiter),
  encode: (roller, waiter, _rules, input) => encodePlakoto(roller, waiter, input),
  fallback: (roller, waiter) => evaluatePlakotoSides(roller, waiter, PLAKOTO_DEFAULT_WEIGHTS),
};

/** Builds a Plakoto net from its shipped form. Throws if the sizes do not match. */
export function loadPlakotoNet(file: NetFile): Net {
  return loadNet(file, PLAKOTO_NET_INPUTS);
}

/** The evaluator for a Plakoto net (or a function that loads it on first use). */
export function createPlakotoNetEvaluator(net: Net | (() => Net), id: string): Evaluator {
  return createNetEvaluator(plakotoNetGame, net, id);
}

let shipped: Net | undefined;

/** The shipped net (`PLAKOTO_NET_V1`), decoded on the first call. */
export function shippedPlakotoNet(): Net {
  shipped ??= loadPlakotoNet(PLAKOTO_NET_V1);
  return shipped;
}

/** The shipped net as an evaluator, for the hard level. */
export const plakotoNet: Evaluator = createPlakotoNetEvaluator(
  shippedPlakotoNet,
  PLAKOTO_NET_V1.id,
);
