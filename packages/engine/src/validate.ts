/**
 * Run-time checks for data that comes from outside (JSON, the database, the
 * network). Each validator takes `unknown`, checks every field, and returns a
 * fresh copy with the right type. On bad input it throws
 * `EngineError('INVALID_STATE')` with the path of the bad field.
 *
 * Unknown keys are rejected. A newer client must bump `schemaVersion`
 * instead of adding fields silently.
 */

import type { BoardState, PointState } from './board';
import { CHECKERS_PER_PLAYER, POINTS_ON_BOARD } from './constants';
import { isDieValue } from './dice';
import type { Dice } from './dice';
import { EngineError } from './errors';
import { PLAYERS, isPlayerId } from './player';
import type { PerPlayer, PlayerId } from './player';
import { GAME_STATE_SCHEMA_VERSION } from './state';
import type { GameState, JsonObject, JsonValue, RulesRef } from './state';

/** Deeper `variantData` is rejected, so bad input cannot blow the stack. */
const MAX_JSON_DEPTH = 32;

function fail(path: string, message: string): never {
  throw new EngineError('INVALID_STATE', message, path);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Checks that `value` is a plain object with exactly these keys. */
function record(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (!isPlainObject(value)) fail(path, 'expected an object');
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'missing field');
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) fail(`${path}.${key}`, 'unknown field');
  }
  return value;
}

function count(value: unknown, path: string): number {
  if (
    !Number.isInteger(value) ||
    (value as number) < 0 ||
    (value as number) > CHECKERS_PER_PLAYER
  ) {
    fail(path, `expected an integer from 0 to ${CHECKERS_PER_PLAYER}`);
  }
  return value as number;
}

function perPlayerCount(value: unknown, path: string): PerPlayer<number> {
  const raw = record(value, path, PLAYERS);
  return {
    white: count(raw['white'], `${path}.white`),
    black: count(raw['black'], `${path}.black`),
  };
}

function point(value: unknown, path: string): PointState {
  const raw = record(value, path, ['white', 'black', 'pinned']);
  const white = count(raw['white'], `${path}.white`);
  const black = count(raw['black'], `${path}.black`);
  const pinned = raw['pinned'];
  if (pinned !== null && !isPlayerId(pinned))
    fail(`${path}.pinned`, 'expected null, "white" or "black"');
  const shared = white > 0 && black > 0;
  if (shared && pinned === null) {
    fail(path, 'both players are on this point but no checker is pinned');
  }
  if (pinned !== null) {
    if (!shared) fail(path, 'a pin needs checkers of both players on the point');
    if ((pinned === 'white' ? white : black) !== 1) fail(path, 'a pinned checker must be alone');
  }
  return { white, black, pinned };
}

/** Checks a board: shape, counts, pins, and 15 checkers per player. */
export function validateBoard(value: unknown, path = 'board'): BoardState {
  const raw = record(value, path, ['points', 'bar', 'outside', 'off']);
  const rawPoints = raw['points'];
  if (!Array.isArray(rawPoints) || rawPoints.length !== POINTS_ON_BOARD) {
    fail(`${path}.points`, `expected an array of ${POINTS_ON_BOARD} points`);
  }
  const board: BoardState = {
    points: rawPoints.map((p: unknown, i) => point(p, `${path}.points[${i}]`)),
    bar: perPlayerCount(raw['bar'], `${path}.bar`),
    outside: perPlayerCount(raw['outside'], `${path}.outside`),
    off: perPlayerCount(raw['off'], `${path}.off`),
  };
  for (const player of PLAYERS) {
    const total = checkerTotal(board, player);
    if (total !== CHECKERS_PER_PLAYER) {
      fail(path, `${player} has ${total} checkers, expected ${CHECKERS_PER_PLAYER}`);
    }
  }
  return board;
}

function checkerTotal(board: BoardState, player: PlayerId): number {
  let total = board.bar[player] + board.outside[player] + board.off[player];
  for (const p of board.points) total += p[player];
  return total;
}

function dice(value: unknown, path: string): Dice | null {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length !== 2) fail(path, 'expected null or two dice');
  const [a, b] = value as unknown[];
  if (!isDieValue(a)) fail(`${path}[0]`, 'expected a die value from 1 to 6');
  if (!isDieValue(b)) fail(`${path}[1]`, 'expected a die value from 1 to 6');
  return [a, b];
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(path, 'expected a non-empty string');
  return value;
}

function positiveInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail(path, 'expected an integer ≥ 1');
  return value as number;
}

function rules(value: unknown, path: string): RulesRef {
  const raw = record(value, path, ['id', 'version']);
  return {
    id: nonEmptyString(raw['id'], `${path}.id`),
    version: positiveInteger(raw['version'], `${path}.version`),
  };
}

function jsonValue(value: unknown, path: string, depth: number): JsonValue {
  if (depth > MAX_JSON_DEPTH) fail(path, 'JSON is nested too deep');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(path, 'numbers must be finite');
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown, i) => jsonValue(item, `${path}[${i}]`, depth + 1));
  }
  if (isPlainObject(value)) return jsonObject(value, path, depth);
  return fail(path, 'expected a JSON value');
}

function jsonObject(value: Record<string, unknown>, path: string, depth: number): JsonObject {
  const out: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = jsonValue(item, `${path}.${key}`, depth + 1);
  }
  return out;
}

const STATE_KEYS = [
  'schemaVersion',
  'variant',
  'rules',
  'board',
  'toMove',
  'dice',
  'turnNumber',
  'variantData',
] as const;

/**
 * Checks a game state that came from outside and returns a typed copy.
 * Throws `EngineError` with code `UNSUPPORTED_SCHEMA_VERSION` for another
 * schema version, or `INVALID_STATE` for any other problem.
 *
 * It checks the shared model only. Variant rules (for example "Fevga has no
 * bar") are the variant's job.
 */
export function validateGameState(value: unknown): GameState {
  if (!isPlainObject(value)) fail('state', 'expected an object');
  const version = value['schemaVersion'];
  if (typeof version === 'number' && version !== GAME_STATE_SCHEMA_VERSION) {
    throw new EngineError(
      'UNSUPPORTED_SCHEMA_VERSION',
      `schemaVersion ${version} is not supported (this engine reads ${GAME_STATE_SCHEMA_VERSION})`,
      'state.schemaVersion',
    );
  }
  const raw = record(value, 'state', STATE_KEYS);
  if (version !== GAME_STATE_SCHEMA_VERSION) fail('state.schemaVersion', 'expected a number');

  const toMove = raw['toMove'];
  if (!isPlayerId(toMove)) fail('state.toMove', 'expected "white" or "black"');

  const variantData = raw['variantData'];
  if (variantData !== null && !isPlainObject(variantData)) {
    fail('state.variantData', 'expected null or an object');
  }

  return {
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    variant: nonEmptyString(raw['variant'], 'state.variant'),
    rules: rules(raw['rules'], 'state.rules'),
    board: validateBoard(raw['board'], 'state.board'),
    toMove,
    dice: dice(raw['dice'], 'state.dice'),
    turnNumber: positiveInteger(raw['turnNumber'], 'state.turnNumber'),
    variantData: variantData === null ? null : jsonObject(variantData, 'state.variantData', 1),
  };
}
