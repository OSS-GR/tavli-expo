/**
 * `asodio-net`: a small neural net for Asodio (owner version, preset
 * `asodio.kafeneio`), trained by TD(λ) self-play like the Portes, Plakoto
 * and Fevga nets (the shared code is in `net.ts`, the training in
 * `src/train/`).
 *
 * It scores a position before the roll, from the view of the player to
 * roll. The net only scores **contact** positions with no **mutual lock**.
 * The Asodio heuristic (`evaluateAsodioSides`) scores the rest:
 *
 * - a race (no pin is possible any more) and a finished game: the race
 *   code and the exact bear-off table;
 * - a mutual lock (`mutualLock` in `asodio-board.ts`): both armies hold
 *   each other forever, so the game ends in a draw. The heuristic scores
 *   it 0, which is exact, and a training game stops there.
 *
 * The net is trained on the owner rules only. For any other rule set (the
 * Acey-Deucey presets with hits and roll chains, or changed army flags) the
 * evaluator uses the heuristic for everything (`isAsodioNetRules`).
 *
 * The net: `ASODIO_NET_INPUTS` inputs → one hidden layer (sigmoid) → 3
 * outputs (sigmoid): P(win), P(win a double), P(lose a double). A draw
 * counts as half a win (the trainer's target for a draw is [0.5, 0, 0]),
 * so equity = 2·win − 1 + winDouble − loseDouble still holds.
 *
 * Inputs (`encodeAsodio`), the roller's side first, then the waiter's, each
 * in its own numbering:
 *
 * - per own point 1–24, 4 inputs (TD-Gammon style): n ≥ 1, n ≥ 2, n ≥ 3,
 *   and (n − 3) / 2 for n > 3 (192 in all);
 * - pin units: 1 when the side's checker on own point 1–24 is pinned (48);
 * - loading: checkers still outside / 15, and 1 while the first-entry gate
 *   holds (all 15 outside) (4);
 * - borne off / 15, pip counts / 100 (waiting checkers count 25) (4);
 * - the quarter lock: the side's rear quarter, one-hot (8); the quarter of
 *   its lowest pinned checker, one-hot (8; none when no checker is pinned);
 *   its checkers frozen in front of the rear quarter / 15 (2); 1 when a
 *   pinned checker holds the rear quarter, so the whole army is frozen (2);
 * - die values with no legal single move / 6, and 1 when no die moves (4);
 * - the rolls out of 36 that pin some checker, and that make a mutual lock,
 *   per side (`asodio-shots.ts`) (4);
 * - the heuristic's share of losses that are doubles (mars), per side (2);
 * - the heuristic's contact score in logits / 4 (`contactScore`) (1).
 */

import type { RuleSet } from '@tavli/engine';
import { asodio, getPreset } from '@tavli/engine';

import { scoreTurns } from '../score';
import type { Evaluation, Evaluator } from '../types';
import {
  OFF,
  PINNED,
  WAIT,
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
import {
  ASODIO_DEFAULT_WEIGHTS,
  asodioHeuristic,
  asodioTurnResult,
  contactScore,
  doubleShare,
  evaluateAsodioSides,
} from './asodio-heuristic';
import { ASODIO_NET_V1 } from './asodio-net-weights';
import { at, createNetEvaluator, loadNet, pushInput, pushPointUnits } from './net';
import type { Net, NetFile, NetGame, SparseInput } from './net';
import { pips } from './portes-board';

/** Number of inputs. */
export const ASODIO_NET_INPUTS = 279;

/** Checkers on the board in front of the rear quarter: the quarter lock freezes them. */
function frozenCheckers(side: AsodioSide, rear: number, options: AsodioOptions): number {
  if (!options.quarterLock) return 0;
  let n = 0;
  for (let p = 1; p <= 24; p += 1) if (quarterOf(p) > rear) n += at(side, p);
  return n;
}

/** Writes the inputs of a position the net scores into `input` (it is reused). */
export function encodeAsodio(
  roller: AsodioSide,
  waiter: AsodioSide,
  options: AsodioOptions,
  input: SparseInput,
): void {
  input.count = 0;
  const dice = [movableDice(roller, waiter, options), movableDice(waiter, roller, options)];
  for (let s = 0; s < 2; s += 1) {
    const side = s === 0 ? roller : waiter;
    const other = s === 0 ? waiter : roller;
    for (let p = 1; p <= 24; p += 1) pushPointUnits(input, s * 96 + (p - 1) * 4, at(side, p));
    for (let p = 1; p <= 24; p += 1) {
      if (at(side, PINNED + p) === 1) pushInput(input, 192 + s * 24 + (p - 1), 1);
    }
    if (at(side, WAIT) > 0) pushInput(input, 240 + s, at(side, WAIT) / 15);
    if (options.firstEntryGate && allOutside(side)) pushInput(input, 242 + s, 1);
    if (at(side, OFF) > 0) pushInput(input, 244 + s, at(side, OFF) / 15);
    pushInput(input, 246 + s, pips(side) / 100);
    const rear = rearQuarter(side);
    pushInput(input, 248 + s * 4 + rear, 1);
    const pinned = lowestPinnedQuarter(side);
    if (pinned < 4) pushInput(input, 256 + s * 4 + pinned, 1);
    const frozen = frozenCheckers(side, rear, options);
    if (frozen > 0) pushInput(input, 264 + s, frozen / 15);
    if (pinned <= rear) pushInput(input, 266 + s, 1);
    let dead = 0;
    for (let die = 1; die <= 6; die += 1) if (dice[s]?.[die] !== true) dead += 1;
    if (dead > 0) pushInput(input, 268 + s, dead / 6);
    if (dead === 6) pushInput(input, 270 + s, 1);
    const share = doubleShare(side, other, ASODIO_DEFAULT_WEIGHTS);
    if (share > 0) pushInput(input, 276 + s, share);
  }
  const contact = contactScore(
    roller,
    waiter,
    dice[0] ?? [],
    dice[1] ?? [],
    ASODIO_DEFAULT_WEIGHTS,
    options,
  );
  if (contact.rollerAny > 0) pushInput(input, 272, contact.rollerAny);
  if (contact.waiterAny > 0) pushInput(input, 273, contact.waiterAny);
  if (contact.rollerLock > 0) pushInput(input, 274, contact.rollerLock);
  if (contact.waiterLock > 0) pushInput(input, 275, contact.waiterLock);
  pushInput(input, 278, contact.score / 4);
}

/**
 * The heuristic's evaluation in the net's terms. The heuristic leaves the
 * draws out of `win` (a sure draw has win 0 and equity 0); the net counts a
 * draw as half a win. Both give the same equity.
 */
export function evaluateAsodioFallback(
  roller: AsodioSide,
  waiter: AsodioSide,
  options: AsodioOptions,
): Evaluation {
  const e = evaluateAsodioSides(roller, waiter, ASODIO_DEFAULT_WEIGHTS, options);
  const win = (e.equity - e.winDouble + e.loseDouble + 1) / 2;
  return { win, winDouble: e.winDouble, loseDouble: e.loseDouble, equity: e.equity };
}

/** Asodio for the shared net code. The context is the move rules (`asodioOptions`). */
export const asodioNetGame: NetGame<AsodioSide, AsodioOptions> = {
  variant: asodio,
  inputs: ASODIO_NET_INPUTS,
  context: asodioOptions,
  sideOf: asodioSideOf,
  play: playAsodioTurn,
  endPoints: asodioTurnResult,
  usesNet: (roller, waiter, options) =>
    at(roller, OFF) < 15 &&
    at(waiter, OFF) < 15 &&
    asodioContact(roller, waiter) &&
    !mutualLock(roller, waiter, options),
  encode: encodeAsodio,
  fallback: evaluateAsodioFallback,
};

const NET_OPTIONS = asodioOptions(getPreset('asodio.kafeneio'));
const netRulesCache = new WeakMap<RuleSet, boolean>();

/** True when `rules` move like the owner version, the rules the net was trained on. */
export function isAsodioNetRules(rules: RuleSet): boolean {
  const cached = netRulesCache.get(rules);
  if (cached !== undefined) return cached;
  const options = asodioOptions(rules);
  const same = (Object.keys(NET_OPTIONS) as (keyof AsodioOptions)[]).every(
    (key) => options[key] === NET_OPTIONS[key],
  );
  netRulesCache.set(rules, same);
  return same;
}

/** Builds an Asodio net from its shipped form. Throws if the sizes do not match. */
export function loadAsodioNet(file: NetFile): Net {
  return loadNet(file, ASODIO_NET_INPUTS);
}

/**
 * The evaluator for an Asodio net (or a function that loads it on first
 * use). With rules the net was not trained on, it is the heuristic.
 */
export function createAsodioNetEvaluator(net: Net | (() => Net), id: string): Evaluator {
  const withNet = createNetEvaluator(asodioNetGame, net, id);
  return {
    id,
    variant: 'asodio',
    evaluate: (state) =>
      isAsodioNetRules(state.rules) ? withNet.evaluate(state) : asodioHeuristic.evaluate(state),
    scoreTurns: (state, turns) =>
      scoreTurns(asodio, isAsodioNetRules(state.rules) ? withNet : asodioHeuristic, state, turns),
  };
}

let shipped: Net | undefined;

/** The shipped net (`ASODIO_NET_V1`), decoded on the first call. */
export function shippedAsodioNet(): Net {
  shipped ??= loadAsodioNet(ASODIO_NET_V1);
  return shipped;
}

/** The shipped net as an evaluator, for the hard level. */
export const asodioNet: Evaluator = createAsodioNetEvaluator(shippedAsodioNet, ASODIO_NET_V1.id);
