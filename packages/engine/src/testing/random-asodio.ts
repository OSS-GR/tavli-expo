/**
 * Random Asodio positions and rule sets for tests. Not exported from the
 * package.
 */

import { rollDice } from '../dice';
import type { Dice } from '../dice';
import { resolveRules } from '../presets';
import type { PresetId, RuleOverrides, RuleSet } from '../rules';
import { createSeededRng } from '../rng';
import type { Rng } from '../rng';
import type { GameState } from '../state';
import { asodio } from '../variants/asodio';

/** The presets and a mix of flags, so the tests reach every rule. */
export const ASODIO_RULE_MIX: readonly (readonly [string, PresetId, RuleOverrides])[] = [
  ['kafeneio', 'asodio.kafeneio', {}],
  ['aceyDeuceyGreek', 'asodio.aceyDeuceyGreek', {}],
  ['aceyDeuceyAmerican', 'asodio.aceyDeuceyAmerican', {}],
  ['kafeneio, moveWhileLoading', 'asodio.kafeneio', { entry: { moveWhileLoading: true } }],
  [
    'kafeneio, moveInsideFrozenQuarter',
    'asodio.kafeneio',
    { quarters: { moveInsideFrozenQuarter: true } },
  ],
  ['kafeneio, hit', 'asodio.kafeneio', { capture: { captureMode: 'hit' } }],
  [
    'kafeneio, exactBearOff, bearOffWhilePinned',
    'asodio.kafeneio',
    { bearOff: { exactBearOff: true, bearOffWhilePinned: true } },
  ],
  [
    'kafeneio, doubleOnly, no higherDieRule',
    'asodio.kafeneio',
    { entry: { firstEntryGateRolls: 'doubleOnly' }, movement: { higherDieRule: false } },
  ],
  [
    'American from own 24 (opponentAcePoint)',
    'asodio.aceyDeuceyAmerican',
    { board: { startPosition: 'allOnOwn24' }, entry: { firstEntryGate: false } },
  ],
  [
    'Greek with the quarter lock',
    'asodio.aceyDeuceyGreek',
    {
      entry: { mustEnterAllFirst: true },
      quarters: { quarterGathering: true, quarterLock: true },
    },
  ],
];

export function mixRules(preset: PresetId, overrides: RuleOverrides): RuleSet {
  return resolveRules(preset, overrides);
}

/** The dice to play now: the chosen double, or a new roll. */
export function diceFor(state: GameState, rng: Rng): Dice {
  return state.dice ?? rollDice(rng);
}

/** Answers a waiting question with a random double, or returns the state as it is. */
export function answerAny(state: GameState, rng: Rng): GameState {
  const question = asodio.prompt?.(state) ?? null;
  if (question === null) return state;
  const choice = question.choices[rng.nextUint32() % question.choices.length] as string;
  return asodio.answerPrompt?.(state, question.player, choice) as GameState;
}

/**
 * Random positions with the dice to play, from random games (a random
 * legal play each turn). Game over: a new game starts.
 */
export function randomAsodioPositions(seed: number, count: number, rules: RuleSet): GameState[] {
  const rng = createSeededRng(seed);
  const out: GameState[] = [];
  let state = asodio.initialState({ startingPlayer: 'white', rules });
  let turn = 0;
  while (out.length < count) {
    if (asodio.isGameOver(state)) state = asodio.initialState({ startingPlayer: 'black', rules });
    state = answerAny(state, rng);
    const dice = diceFor(state, rng);
    const rolled = { ...state, dice };
    if (turn % 3 === 0) out.push(rolled);
    const turns = asodio.legalTurns(rolled, dice);
    const pick = turns[rng.nextUint32() % turns.length];
    if (pick === undefined) throw new Error('no legal turn');
    state = asodio.applyTurn(rolled, pick);
    turn += 1;
  }
  return out;
}
