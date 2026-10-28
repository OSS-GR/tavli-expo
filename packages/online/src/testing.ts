/**
 * Test helpers for online games. Import them from `@tavli/online/testing`,
 * in test files only. They are plain functions, so Vitest and Jest can
 * both use them.
 */

import { VARIANT_REGISTRY, createBoard, getVariant, plakoto } from '@tavli/engine';
import type { GameFlow, GameState, MatchFlow, MoveInput, Rng } from '@tavli/engine';

/** A legal full turn for the player to move, picked with `rng`. */
export function pickTurn(game: GameFlow, rng: Rng): MoveInput[] {
  const { state } = game;
  if (game.phase !== 'moving' || state.dice === null) {
    throw new Error(`no turn to play in phase ${game.phase}`);
  }
  const turns = getVariant(VARIANT_REGISTRY, state.variant).legalTurns(state, state.dice);
  const turn = turns[rng.nextUint32() % turns.length];
  if (turn === undefined) throw new Error('no legal turn');
  return [...turn.moves];
}

/** One of `choices`, picked with `rng`. */
export function pickChoice(choices: readonly string[], rng: Rng): string {
  const choice = choices[rng.nextUint32() % choices.length];
  if (choice === undefined) throw new Error('no choices');
  return choice;
}

/** A Plakoto flow just before Black pins White's mother, and the turn that pins it. */
export interface MotherPin {
  readonly flow: MatchFlow;
  /** Black's full turn. After it, the server asks White the mother question. */
  readonly pin: readonly MoveInput[];
}

/**
 * Puts the current game of the Plakoto match `flow` in a position where
 * Black, to move with 5-2, can pin White's mother (White's lone checker
 * on its start point): `w: 24 7x14 ; b: 10x14 3`.
 *
 * White's 14 other checkers sit on point 7, so every roll after a `playOn`
 * has a legal move: the wait stays with White whatever the server rolls
 * (#308). (On point 6, as in the engine test `plakoto-mother.test.ts`,
 * 6-6 has no move: White passes, and a test that expects White to move
 * fails once in 36 runs.)
 *
 * A test saves the returned flow on the server (on Convex: patch
 * `games.flow` with `storeFlow`), then sends `pin` as Black's turn.
 */
export function motherPin(flow: MatchFlow): MotherPin {
  const board = createBoard(
    { white: { points: { 24: 1, 7: 14 } }, black: { points: { 10: 14, 3: 1 } } },
    'contrary',
  );
  const state: GameState = {
    ...flow.game.state,
    board,
    toMove: 'black',
    dice: [5, 2],
    turnNumber: 9,
    variantData: null,
  };
  const game: GameFlow = {
    ...flow.game,
    phase: 'moving',
    state,
    starter: 'black',
    played: [],
    lastTurn: null,
    result: null,
  };
  const pin = plakoto
    .legalTurns(state, [5, 2])
    .find((turn) => turn.moves.some((m) => m.capture === 'pin'));
  if (pin === undefined) throw new Error('no pinning turn');
  return { flow: { ...flow, game }, pin: [...pin.moves] };
}
