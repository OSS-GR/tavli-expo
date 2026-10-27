// Shared test code. The file names have two dots, so Convex does not deploy
// them, and the glob below skips them (and tests and `.d.ts` files) too.

import { VARIANT_REGISTRY, getVariant } from '@tavli/engine';
import type { GameFlow, MoveInput, Rng } from '@tavli/engine';

/**
 * The Convex modules for convex-test: files with one dot, like Convex
 * deploys. (The convex-test docs use the extglob `!(*.*.*)*.*s`; the
 * Vite glob of Vitest 5 does not support it, so we use a negative pattern.)
 */
export const modules = import.meta.glob(['./**/*.*s', '!./**/*.*.*s']);

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
