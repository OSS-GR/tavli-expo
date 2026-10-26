/**
 * JSON text in and out.
 *
 * `GameState` is already plain data, so Convex can store the object itself.
 * Use these two functions when you need a string (network, files, logs).
 * Always run data from outside through `parseGameState` or
 * `validateGameState` before you use it.
 */

import { EngineError } from './errors';
import { validateMatch } from './match';
import type { Match } from './match';
import type { RuleSet } from './rules';
import { validateRules } from './rules-validate';
import type { GameState } from './state';
import { validateGameState } from './validate';

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new EngineError('INVALID_JSON', `not valid JSON: ${reason}`);
  }
}

/** Turns a state into JSON text. Checks the state first, so bad data never leaves. */
export function serializeGameState(state: GameState): string {
  return JSON.stringify(validateGameState(state));
}

/**
 * Reads a state from JSON text. A version 1 state is upgraded to the
 * current version. Throws `EngineError` with code `INVALID_JSON`,
 * `UNSUPPORTED_SCHEMA_VERSION`, `INVALID_STATE`, `INVALID_RULES`,
 * `RULES_CONFLICT` or `UNKNOWN_PRESET`.
 */
export function parseGameState(text: string): GameState {
  return validateGameState(parseJson(text));
}

/** Turns a `RuleSet` into JSON text. Checks it first. */
export function serializeRules(rules: RuleSet): string {
  return JSON.stringify(validateRules(rules));
}

/**
 * Reads a `RuleSet` from JSON text. Throws `EngineError` with code
 * `INVALID_JSON`, `INVALID_RULES` or `RULES_CONFLICT`.
 */
export function parseRules(text: string): RuleSet {
  return validateRules(parseJson(text));
}

/** Turns a match into JSON text. Checks it first. */
export function serializeMatch(match: Match): string {
  return JSON.stringify(validateMatch(match));
}

/**
 * Reads a match from JSON text. Throws `EngineError` with code
 * `INVALID_JSON`, `UNSUPPORTED_SCHEMA_VERSION`, `INVALID_STATE`,
 * `INVALID_RULES` or `RULES_CONFLICT`.
 */
export function parseMatch(text: string): Match {
  return validateMatch(parseJson(text));
}
