/**
 * Random Portes positions, used only in tests. Not exported from the
 * package. Plays random games with a seeded RNG and keeps every `every`-th
 * state, with the dice rolled for it.
 */

import { rollDice } from '../dice';
import { createSeededRng } from '../rng';
import type { GameState } from '../state';
import { portes } from '../variants/portes';

export function randomPositions(seed: number, count: number, every = 7): GameState[] {
  const rng = createSeededRng(seed);
  const out: GameState[] = [];
  let state = portes.initialState({ startingPlayer: 'white' });
  let turn = 0;
  while (out.length < count) {
    if (portes.isGameOver(state)) state = portes.initialState({ startingPlayer: 'white' });
    const dice = rollDice(rng);
    if (turn % every === 0) out.push({ ...state, dice });
    const turns = portes.legalTurns(state, dice);
    const pick = turns[rng.nextUint32() % turns.length];
    if (pick === undefined) throw new Error('no legal turn');
    state = portes.applyTurn(state, pick);
    turn += 1;
  }
  return out;
}
