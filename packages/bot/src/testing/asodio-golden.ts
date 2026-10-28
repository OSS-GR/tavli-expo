/**
 * The golden set of the Asodio heuristic (#225), for tests and the bench
 * only (not exported from the package).
 *
 * It holds seeded random positions from all three Asodio presets. The
 * fixture `src/evaluators/asodio-heuristic.golden.json` keeps the scores the
 * heuristic gave them before the speed work, and
 * `asodio-heuristic.golden.test.ts` checks that the heuristic still gives
 * exactly those numbers. Capture it again (`pnpm --filter @tavli/bot
 * golden:asodio`) only when a change of the scores is the point.
 *
 * Each entry of the fixture is one string, so the file keeps one line per
 * position:
 *
 * - `positions`: `"<roller> <waiter> <win> <winDouble> <loseDouble> <equity>"`:
 *   the side to roll and the other side as `sideKey` strings, then
 *   `evaluateAsodioSides` with the default weights.
 * - `turns`: `scoreTurns` on every legal turn of one position, each
 *   `<score>`, or `<score>!` when the turn ends the game.
 *
 * A JSON number keeps every bit of a double, so `Number` reads back the
 * exact value.
 */

import { asodio, getPreset, opponent } from '@tavli/engine';
import type { Dice, GameState, PresetId, Turn } from '@tavli/engine';

import type { Evaluation, TurnScore } from '../types';
import { asodioOptions, asodioSideOf } from '../evaluators/asodio-board';
import type { AsodioSide } from '../evaluators/asodio-board';
import {
  ASODIO_DEFAULT_WEIGHTS,
  asodioHeuristic,
  evaluateAsodioSides,
} from '../evaluators/asodio-heuristic';
import { randomAsodioPositions } from './random-asodio-positions';

/** The presets, each with its seed. */
export const GOLDEN_PRESETS: readonly (readonly [PresetId, number])[] = [
  ['asodio.kafeneio', 225],
  ['asodio.aceyDeuceyGreek', 226],
  ['asodio.aceyDeuceyAmerican', 227],
];

/** Positions per preset (3 × 700 = 2,100). */
export const GOLDEN_POSITIONS = 700;

/** Of those, the first this many also keep the scores of every legal turn. */
export const GOLDEN_TURN_POSITIONS = 60;

/**
 * The seeded positions of one preset: every second state of random games,
 * each position once (the same sides to roll and to wait).
 */
export function goldenStates(preset: PresetId, seed: number): GameState[] {
  const seen = new Set<string>();
  const out: GameState[] = [];
  for (const state of randomAsodioPositions(seed, 4 * GOLDEN_POSITIONS, 2, getPreset(preset))) {
    const key = `${sideKey(asodioSideOf(state, state.toMove))} ${sideKey(asodioSideOf(state, opponent(state.toMove)))}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(state);
    if (out.length === GOLDEN_POSITIONS) return out;
  }
  throw new Error(`${preset}: fewer than ${GOLDEN_POSITIONS} different positions`);
}

/** A side as 51 hex digits, one per entry (every entry is 0–15). */
export function sideKey(side: AsodioSide): string {
  return side.map((n) => n.toString(16)).join('');
}

export function parseSideKey(key: string): AsodioSide {
  return Array.from(key, (digit) => parseInt(digit, 16));
}

export function evaluationText(e: Evaluation): string {
  return `${e.win} ${e.winDouble} ${e.loseDouble} ${e.equity}`;
}

/** One `positions` entry: the two sides of the state (the side to roll first), then the scores. */
export function positionLine(state: GameState): string {
  const roller = asodioSideOf(state, state.toMove);
  const waiter = asodioSideOf(state, opponent(state.toMove));
  const e = evaluateAsodioSides(roller, waiter, ASODIO_DEFAULT_WEIGHTS, asodioOptions(state.rules));
  return `${sideKey(roller)} ${sideKey(waiter)} ${evaluationText(e)}`;
}

/** The heuristic's `scoreTurns` (it always has one). */
export function heuristicScoreTurns(
  state: GameState,
  turns: readonly Turn[],
): readonly TurnScore[] {
  const scoreTurns = asodioHeuristic.scoreTurns;
  if (scoreTurns === undefined) throw new Error('the Asodio heuristic has no scoreTurns');
  return scoreTurns(state, turns);
}

/** One `turns` entry: the heuristic's `scoreTurns` on every legal turn of the state. */
export function turnsLine(state: GameState): string {
  const turns = asodio.legalTurns(state, state.dice as Dice);
  return heuristicScoreTurns(state, turns)
    .map((s) => `${s.score}${s.gameOver ? '!' : ''}`)
    .join(' ');
}
