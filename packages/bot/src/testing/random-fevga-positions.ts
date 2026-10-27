/**
 * Random Fevga positions, for tests only (not exported from the package).
 * Plays uniformly random games with a seeded RNG and keeps every `every`-th
 * state, with the dice rolled for it.
 */

import { createSeededRng, fevga, rollDice } from '@tavli/engine';
import type { GameState } from '@tavli/engine';

import { pickOne } from '../random';

export function randomFevgaPositions(seed: number, count: number, every = 5): GameState[] {
  const rng = createSeededRng(seed);
  const out: GameState[] = [];
  let state = fevga.initialState({ startingPlayer: 'white' });
  let turn = 0;
  while (out.length < count) {
    if (fevga.isGameOver(state)) state = fevga.initialState({ startingPlayer: 'white' });
    const dice = rollDice(rng);
    if (turn % every === 0) out.push({ ...state, dice });
    state = fevga.applyTurn(state, pickOne(rng, fevga.legalTurns(state, dice)));
    turn += 1;
  }
  return out;
}
