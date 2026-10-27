/**
 * Random Portes positions, for tests only (not exported from the package).
 * Plays uniformly random games with a seeded RNG and keeps every `every`-th
 * state, with the dice rolled for it.
 */

import { createSeededRng, portes, rollDice } from '@tavli/engine';
import type { GameState } from '@tavli/engine';

import { pickOne } from '../random';

export function randomPositions(seed: number, count: number, every = 5): GameState[] {
  const rng = createSeededRng(seed);
  const out: GameState[] = [];
  let state = portes.initialState({ startingPlayer: 'white' });
  let turn = 0;
  while (out.length < count) {
    if (portes.isGameOver(state)) state = portes.initialState({ startingPlayer: 'white' });
    const dice = rollDice(rng);
    if (turn % every === 0) out.push({ ...state, dice });
    state = portes.applyTurn(state, pickOne(rng, portes.legalTurns(state, dice)));
    turn += 1;
  }
  return out;
}
