/**
 * Random Fevga positions, used only in tests. Not exported from the
 * package. Plays random games with a seeded RNG and keeps every `every`-th
 * state, with the dice rolled for it.
 */

import { rollDice } from '../dice';
import { createSeededRng } from '../rng';
import type { GameState } from '../state';
import { fevga } from '../variants/fevga';

export function randomFevgaPositions(seed: number, count: number, every = 7): GameState[] {
  const rng = createSeededRng(seed);
  const out: GameState[] = [];
  let state = fevga.initialState({ startingPlayer: 'white' });
  let turn = 0;
  while (out.length < count) {
    if (fevga.isGameOver(state)) state = fevga.initialState({ startingPlayer: 'white' });
    const dice = rollDice(rng);
    if (turn % every === 0) out.push({ ...state, dice });
    const turns = fevga.legalTurns(state, dice);
    const pick = turns[rng.nextUint32() % turns.length];
    if (pick === undefined) throw new Error('no legal turn');
    state = fevga.applyTurn(state, pick);
    turn += 1;
  }
  return out;
}
