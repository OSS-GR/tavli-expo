/**
 * Random Asodio positions, for tests only (not exported from the package).
 * Plays uniformly random games with a seeded RNG and keeps every `every`-th
 * state, with the dice for it (the chosen double when the state holds one,
 * else a new roll). A `chooseDouble` question gets a random answer. A
 * finished game (borne off or a deadlock) starts a new one.
 */

import { asodio, createSeededRng, rollDice } from '@tavli/engine';
import type { GameState, RuleSet } from '@tavli/engine';

import { pickOne } from '../random';

export function randomAsodioPositions(
  seed: number,
  count: number,
  every = 3,
  rules?: RuleSet,
): GameState[] {
  const rng = createSeededRng(seed);
  const out: GameState[] = [];
  const fresh = (): GameState =>
    asodio.initialState({ startingPlayer: 'white', ...(rules === undefined ? {} : { rules }) });
  let state = fresh();
  let turn = 0;
  while (out.length < count) {
    if (asodio.isGameOver(state)) state = fresh();
    const prompt = asodio.prompt?.(state) ?? null;
    if (prompt !== null && asodio.answerPrompt !== undefined) {
      state = asodio.answerPrompt(state, prompt.player, pickOne(rng, prompt.choices));
      continue;
    }
    const dice = state.dice ?? rollDice(rng);
    const rolled = { ...state, dice };
    if (turn % every === 0) out.push(rolled);
    state = asodio.applyTurn(rolled, pickOne(rng, asodio.legalTurns(rolled, dice)));
    turn += 1;
  }
  return out;
}
