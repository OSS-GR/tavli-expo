/**
 * JSON text in and out.
 *
 * `GameState` is already plain data, so Convex can store the object itself.
 * Use these two functions when you need a string (network, files, logs).
 * Always run data from outside through `parseGameState` or
 * `validateGameState` before you use it.
 */

import { EngineError } from './errors';
import type { GameState } from './state';
import { validateGameState } from './validate';

/** Turns a state into JSON text. Checks the state first, so bad data never leaves. */
export function serializeGameState(state: GameState): string {
  return JSON.stringify(validateGameState(state));
}

/**
 * Reads a state from JSON text. Throws `EngineError` with code
 * `INVALID_JSON`, `UNSUPPORTED_SCHEMA_VERSION` or `INVALID_STATE`.
 */
export function parseGameState(text: string): GameState {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new EngineError('INVALID_JSON', `not valid JSON: ${reason}`);
  }
  return validateGameState(value);
}
