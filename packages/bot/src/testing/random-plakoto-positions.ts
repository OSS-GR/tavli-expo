/**
 * Random Plakoto positions, for tests only (not exported from the package).
 * Plays uniformly random games with a seeded RNG and keeps every `every`-th
 * state, with the dice rolled for it. A pinned mother always plays on, so
 * positions with a pinned mother come up too.
 */

import { createSeededRng, plakoto, rollDice } from '@tavli/engine';
import type { GameState, RuleSet } from '@tavli/engine';

import { pickOne } from '../random';

export function randomPlakotoPositions(
  seed: number,
  count: number,
  every = 5,
  rules?: RuleSet,
): GameState[] {
  const rng = createSeededRng(seed);
  const out: GameState[] = [];
  const fresh = (): GameState =>
    plakoto.initialState({ startingPlayer: 'white', ...(rules === undefined ? {} : { rules }) });
  let state = fresh();
  let turn = 0;
  while (out.length < count) {
    if (plakoto.isGameOver(state)) state = fresh();
    const prompt = plakoto.prompt?.(state) ?? null;
    if (prompt !== null && plakoto.answerPrompt !== undefined) {
      state = plakoto.answerPrompt(state, prompt.player, 'playOn');
      continue;
    }
    const dice = rollDice(rng);
    if (turn % every === 0) out.push({ ...state, dice });
    state = plakoto.applyTurn(state, pickOne(rng, plakoto.legalTurns(state, dice)));
    turn += 1;
  }
  return out;
}
