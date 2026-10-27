/**
 * A Tavli match: a series of games to a target score (#24).
 *
 * Rules: `docs/rules/tavli-match.md` ("Who starts later games", "Winning &
 * scoring", "Match format") and the scoring sections of the game files.
 *
 * `Match` is plain, readonly JSON, like `GameState`. Functions never change
 * a match; they return a new one. The match does not hold the board of the
 * game being played. The turn flow (#25) keeps that, and calls
 * `recordGameResult` when a game ends.
 */

import { CHECKERS_PER_PLAYER } from './constants';
import { EngineError } from './errors';
import { absoluteToOwn } from './numbering';
import { PLAYERS, isPlayerId, opponent } from './player';
import type { PerPlayer, PlayerId } from './player';
import { DEFAULT_PRESET_BY_GAME, getPreset } from './presets';
import type { RuleSet } from './rules';
import { validateRules } from './rules-validate';
import type { GameState, StandardVariantId, VariantId } from './state';
import { GAME_END_REASONS } from './variant';
import type { GameEndReason, GameResult, VariantRegistry } from './variant';
import { VARIANT_REGISTRY } from './variants';

/** The version of the `Match` shape. Bump it when the shape changes. */
export const MATCH_SCHEMA_VERSION = 1;

/** One finished game of a match. */
export interface GameRecord {
  /** The game that was played, from the rotation. */
  readonly variant: VariantId;
  /** Who played first. */
  readonly starter: PlayerId;
  /** `null` for a draw. */
  readonly winner: PlayerId | null;
  /** Points the winner got. 0 for a draw. */
  readonly points: number;
  readonly reason: GameEndReason;
}

export type MatchStatus = 'in-progress' | 'finished';

export interface Match {
  readonly schemaVersion: typeof MATCH_SCHEMA_VERSION;
  /**
   * The rules of the match. `rules.match` holds the match flags. The game
   * whose preset this is uses these rules as they are; other games in the
   * rotation use their default preset with this `match` group (see
   * `gameRules`). The `tavli` preset is a match preset: every game uses its
   * own default preset.
   */
  readonly rules: RuleSet;
  /** First to this score wins. Always equal to `rules.match.targetPoints`. */
  readonly targetPoints: number;
  /** A name or id for each player, chosen by the app. The engine only keeps it. */
  readonly players: PerPlayer<string>;
  /** Points so far. Always the sum of `games`. */
  readonly score: PerPlayer<number>;
  /** The finished games, oldest first. */
  readonly games: readonly GameRecord[];
  /**
   * Where the next game is in `rules.match.rotation`. Always
   * `games.length % rotation.length`: the rotation moves on after every
   * game, a draw too (`tavli-match.md`, "Match format").
   */
  readonly rotationIndex: number;
  /**
   * Who starts the next game, or `null` when an opening roll decides it
   * (game 1, after a draw, or `nextGameStarter: "openingRoll"`). `null` once
   * the match is over.
   */
  readonly nextStarter: PlayerId | null;
  readonly status: MatchStatus;
  /** The match winner once `status` is `'finished'`, else `null`. */
  readonly winner: PlayerId | null;
  /** The player who resigned the match, or `null`. */
  readonly resignedBy: PlayerId | null;
}

export interface CreateMatchOptions {
  /**
   * Default: the `portes` preset (a Portes-only match). Use the `tavli`
   * preset for the rotation Portes → Plakoto → Fevga.
   */
  readonly rules?: RuleSet;
  /** Default: `rules.match.targetPoints`. Any positive integer. */
  readonly targetPoints?: number;
  /** Default: `{ white: 'white', black: 'black' }`. */
  readonly players?: PerPlayer<string>;
  /**
   * Who starts game 1. Default `null`: an opening roll decides. Set it for
   * `openingRoll: "chosenStarterRolls"` or a rematch.
   */
  readonly starter?: PlayerId | null;
}

function illegal(message: string): never {
  throw new EngineError('ILLEGAL_ACTION', message);
}

function checkTarget(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new EngineError('OUT_OF_RANGE', `target points must be an integer ≥ 1`, path);
  }
  return value as number;
}

/** Starts a match. No game is played yet. */
export function createMatch(options: CreateMatchOptions = {}): Match {
  let rules = validateRules(options.rules ?? getPreset('portes'));
  const targetPoints = checkTarget(
    options.targetPoints ?? rules.match.targetPoints,
    'options.targetPoints',
  );
  if (targetPoints !== rules.match.targetPoints) {
    rules = validateRules({ ...rules, match: { ...rules.match, targetPoints } });
  }
  const players = options.players ?? { white: 'white', black: 'black' };
  for (const player of PLAYERS) {
    if (typeof players[player] !== 'string' || players[player].length === 0) {
      throw new EngineError('OUT_OF_RANGE', 'player names must be non-empty strings', player);
    }
  }
  const starter = options.starter ?? null;
  if (starter !== null && !isPlayerId(starter)) {
    throw new EngineError('OUT_OF_RANGE', `bad starter ${JSON.stringify(starter)}`, 'starter');
  }
  return {
    schemaVersion: MATCH_SCHEMA_VERSION,
    rules,
    targetPoints,
    players: { white: players.white, black: players.black },
    score: { white: 0, black: 0 },
    games: [],
    rotationIndex: 0,
    nextStarter: starter,
    status: 'in-progress',
    winner: null,
    resignedBy: null,
  };
}

/** The game the match plays next (or would play next, once it is over). */
export function nextVariantId(match: Match): StandardVariantId {
  const id = match.rules.match.rotation[match.rotationIndex];
  if (id === undefined) throw new EngineError('INVALID_STATE', 'bad rotation index');
  return id;
}

/** The games of the rotation that `registry` cannot play yet. Empty when all are built. */
export function missingVariants(
  match: Match,
  registry: VariantRegistry = VARIANT_REGISTRY,
): StandardVariantId[] {
  const missing = new Set<StandardVariantId>();
  for (const id of match.rules.match.rotation) if (!registry.has(id)) missing.add(id);
  return [...missing];
}

/**
 * The game a preset belongs to: `'asodio.kafeneio'` → `'asodio'`. The
 * match preset `'tavli'` belongs to no single game.
 */
function presetGame(rules: RuleSet): string {
  return rules.presetId.split('.')[0] ?? rules.presetId;
}

/**
 * The rules for one game of the match. The game of `match.rules` (its
 * preset) uses those rules. Another game in the rotation uses its default
 * preset (`DEFAULT_PRESET_BY_GAME`) with the match flags of `match.rules`.
 * With the `tavli` preset, every game uses its default preset.
 */
export function gameRules(match: Match, variant: StandardVariantId): RuleSet {
  if (presetGame(match.rules) === variant) return match.rules;
  const preset = getPreset(DEFAULT_PRESET_BY_GAME[variant]);
  return validateRules({ ...preset, match: match.rules.match });
}

/**
 * The start state of the next game: the next game of the rotation, its
 * rules, and `startingPlayer` to move.
 *
 * Throws `EngineError`:
 * - `ILLEGAL_ACTION` when the match is over;
 * - `UNKNOWN_VARIANT` when `registry` cannot play the next game (the
 *   built-in registry plays all four games). The message names the game
 *   and the path points at the rotation entry.
 */
export function startNextGame(
  match: Match,
  startingPlayer: PlayerId,
  registry: VariantRegistry = VARIANT_REGISTRY,
): GameState {
  if (match.status !== 'in-progress') illegal('the match is over');
  const id = nextVariantId(match);
  // Only a custom registry can miss a game now: all four games are built.
  const variant = registry.get(id);
  if (variant === undefined) {
    throw new EngineError(
      'UNKNOWN_VARIANT',
      `game ${match.games.length + 1} of the match is ${id}, and ${id} is not available yet`,
      `match.rules.match.rotation[${match.rotationIndex}]`,
    );
  }
  return variant.initialState({ startingPlayer, rules: gameRules(match, id) });
}

/** Who starts the game after `game`, per the match flags. `null` = opening roll. */
function starterAfter(rules: RuleSet, game: GameRecord): PlayerId | null {
  const flags = rules.match;
  if (game.winner === null) {
    // tavli-match.md: after a draw, a new opening roll (ΕΟΠΤ 3.1.ii).
    return flags.afterDrawStarter === 'previousStarter' ? game.starter : null;
  }
  switch (flags.nextGameStarter) {
    case 'previousWinner':
      return game.winner;
    case 'alternate':
      return opponent(game.starter);
    case 'openingRoll':
      return null;
  }
}

function checkResult(result: GameResult, path: string): GameResult {
  const { winner, points, reason } = result;
  if (winner !== null && !isPlayerId(winner)) {
    throw new EngineError('OUT_OF_RANGE', `bad winner ${JSON.stringify(winner)}`, `${path}.winner`);
  }
  if (!(GAME_END_REASONS as readonly string[]).includes(reason)) {
    throw new EngineError('OUT_OF_RANGE', `bad reason ${JSON.stringify(reason)}`, `${path}.reason`);
  }
  if (!Number.isSafeInteger(points)) {
    throw new EngineError('OUT_OF_RANGE', 'points must be an integer', `${path}.points`);
  }
  if (winner === null && points !== 0) {
    throw new EngineError('OUT_OF_RANGE', 'a draw is worth 0 points', `${path}.points`);
  }
  if (winner !== null && points < 1) {
    throw new EngineError('OUT_OF_RANGE', 'a win is worth at least 1 point', `${path}.points`);
  }
  if (winner === null && (reason === 'resigned' || reason === 'timeout')) {
    throw new EngineError('OUT_OF_RANGE', `a ${reason} game has a winner`, `${path}.winner`);
  }
  return { winner, points, reason };
}

export interface RecordGameOptions {
  /**
   * Who started the game. Needed when `match.nextStarter` is `null` (an
   * opening roll decided it). Must agree with `match.nextStarter` otherwise.
   */
  readonly starter?: PlayerId;
}

/**
 * Adds a finished game of the next variant in the rotation and returns the
 * next match state: new score, next game in the rotation, and who starts it.
 *
 * - The match ends as soon as a score is ≥ `targetPoints`. Overshooting is
 *   fine (4 + 2 = 6 in a match to 5).
 * - A draw (`winner: null`, 0 points) changes no score. The rotation still
 *   moves on.
 * - Next starter: after a win, `nextGameStarter` (default: the winner);
 *   after a draw, `afterDrawStarter` (default: a new opening roll).
 *
 * Throws `ILLEGAL_ACTION` when the match is over or the starter is unknown
 * or wrong, and `OUT_OF_RANGE` for a bad result.
 */
export function recordGameResult(
  match: Match,
  result: GameResult,
  options: RecordGameOptions = {},
): Match {
  if (match.status !== 'in-progress') illegal('the match is over');
  const checked = checkResult(result, 'result');
  const given = options.starter ?? null;
  if (given !== null && !isPlayerId(given)) illegal(`bad starter ${JSON.stringify(given)}`);
  if (given !== null && match.nextStarter !== null && given !== match.nextStarter) {
    illegal(`${match.nextStarter} starts this game, not ${given}`);
  }
  const starter = given ?? match.nextStarter;
  if (starter === null) illegal('an opening roll decided who started; pass options.starter');

  const game: GameRecord = { variant: nextVariantId(match), starter, ...checked };
  const score =
    checked.winner === null
      ? match.score
      : { ...match.score, [checked.winner]: match.score[checked.winner] + checked.points };
  const won = checked.winner !== null && score[checked.winner] >= match.targetPoints;
  return {
    ...match,
    score,
    games: [...match.games, game],
    rotationIndex: (match.rotationIndex + 1) % match.rules.match.rotation.length,
    nextStarter: won ? null : starterAfter(match.rules, game),
    status: won ? 'finished' : 'in-progress',
    winner: won ? checked.winner : null,
  };
}

/** Ends the match now: `player` resigns it and the opponent wins. The score stays as it is. */
export function resignMatch(match: Match, player: PlayerId): Match {
  if (match.status !== 'in-progress') illegal('the match is over');
  if (!isPlayerId(player)) illegal(`bad player ${JSON.stringify(player)}`);
  return {
    ...match,
    nextStarter: null,
    status: 'finished',
    winner: opponent(player),
    resignedBy: player,
  };
}

/**
 * A new match against the same opponent, with the same rules and players.
 * `rematchStarter: "lastGameWinner"` (default, owner rule): the winner of
 * the last game starts with no opening roll. That is always the match
 * winner (the last game is the one that reached the target, or the match
 * was resigned). `"openingRoll"`: an opening roll decides.
 */
export function createRematch(match: Match): Match {
  if (match.status !== 'finished') illegal('the match is not over yet');
  return createMatch({
    rules: match.rules,
    targetPoints: match.targetPoints,
    players: match.players,
    starter: match.rules.match.rematchStarter === 'lastGameWinner' ? match.winner : null,
  });
}

// ---------------------------------------------------------------------------
// Resigning a game.

/** True when `loser` has a checker on the bar or in `winner`'s home (winner's own 1–6). */
function isBackgammon(state: GameState, loser: PlayerId): boolean {
  const { board } = state;
  if (board.bar[loser] > 0) return true;
  const winner = opponent(loser);
  const direction = state.rules.movement.direction;
  return board.points.some(
    (point, index) => point[loser] > 0 && absoluteToOwn(index + 1, winner, direction) <= 6,
  );
}

/**
 * The points `winner` gets when `loser` gives up in this position, per
 * `rules.scoring`:
 *
 * - `"tavli"`: mono 1 if the loser has borne off a checker, else diplo 2.
 *   With `backgammonScores3`, 3 when the loser also has a checker on the
 *   bar or in the winner's home.
 * - `"perChecker"`: 1 per checker the loser has not borne off.
 * - `"singleOnly"`: always 1.
 */
export function pointsForLoss(state: GameState, loser: PlayerId): number {
  const scoring = state.rules.scoring;
  const off = state.board.off[loser];
  switch (scoring.method) {
    case 'singleOnly':
      return 1;
    case 'perChecker':
      return CHECKERS_PER_PLAYER - off;
    case 'tavli':
      if (off > 0) return 1;
      return scoring.backgammonScores3 && isBackgammon(state, loser) ? 3 : 2;
  }
}

/**
 * The result when `player` resigns the game now. The opponent wins what
 * they would win if the game ended in this position (owner rule, wireframes
 * #63): mono if `player` has borne off at least one checker, else diplo.
 * A variant with a `resignResult` method decides instead.
 *
 * Throws `ILLEGAL_ACTION` when the game is already over.
 */
export function resignGame(
  state: GameState,
  player: PlayerId,
  registry: VariantRegistry = VARIANT_REGISTRY,
): GameResult {
  if (!isPlayerId(player)) illegal(`bad player ${JSON.stringify(player)}`);
  const variant = registry.get(state.variant);
  if (variant?.isGameOver(state)) illegal('the game is over');
  if (variant?.resignResult !== undefined) return variant.resignResult(state, player);
  return { winner: opponent(player), points: pointsForLoss(state, player), reason: 'resigned' };
}

// ---------------------------------------------------------------------------
// Validation of a match from outside (JSON, the database).

function fail(path: string, message: string): never {
  throw new EngineError('INVALID_STATE', message, path);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function record(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (!isPlainObject(value)) fail(path, 'expected an object');
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${path}.${key}`, 'missing field');
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) fail(`${path}.${key}`, 'unknown field');
  }
  return value;
}

function playerOrNull(value: unknown, path: string): PlayerId | null {
  if (value !== null && !isPlayerId(value)) fail(path, 'expected null, "white" or "black"');
  return value;
}

function player(value: unknown, path: string): PlayerId {
  if (!isPlayerId(value)) fail(path, 'expected "white" or "black"');
  return value;
}

function gameRecord(value: unknown, path: string, expected: VariantId): GameRecord {
  const raw = record(value, path, ['variant', 'starter', 'winner', 'points', 'reason']);
  if (raw['variant'] !== expected) fail(`${path}.variant`, `expected "${expected}" (rotation)`);
  const starter = player(raw['starter'], `${path}.starter`);
  const winner = playerOrNull(raw['winner'], `${path}.winner`);
  const reason = raw['reason'];
  if (!(GAME_END_REASONS as readonly unknown[]).includes(reason)) {
    fail(`${path}.reason`, 'unknown reason');
  }
  const points = raw['points'];
  if (!Number.isSafeInteger(points) || (points as number) < 0) {
    fail(`${path}.points`, 'expected an integer ≥ 0');
  }
  try {
    checkResult({ winner, points: points as number, reason: reason as GameEndReason }, path);
  } catch (error) {
    fail(path, error instanceof Error ? error.message : String(error));
  }
  return {
    variant: expected,
    starter,
    winner,
    points: points as number,
    reason: reason as GameEndReason,
  };
}

const MATCH_KEYS = [
  'schemaVersion',
  'rules',
  'targetPoints',
  'players',
  'score',
  'games',
  'rotationIndex',
  'nextStarter',
  'status',
  'winner',
  'resignedBy',
] as const;

/**
 * Checks a match that came from outside and returns a typed copy. Besides
 * the shape, it checks that the stored totals fit the games: the score is
 * the sum of the games, each game is the right one of the rotation, the
 * match ended at the first score ≥ target, and the next starter follows
 * the match flags.
 *
 * Throws `EngineError`: `UNSUPPORTED_SCHEMA_VERSION`, `INVALID_RULES`,
 * `RULES_CONFLICT`, or `INVALID_STATE` (with the path of the bad field).
 */
export function validateMatch(value: unknown): Match {
  if (!isPlainObject(value)) fail('match', 'expected an object');
  if (value['schemaVersion'] !== MATCH_SCHEMA_VERSION) {
    throw new EngineError(
      'UNSUPPORTED_SCHEMA_VERSION',
      `match schemaVersion ${String(value['schemaVersion'])} is not supported (this engine reads ${MATCH_SCHEMA_VERSION})`,
      'match.schemaVersion',
    );
  }
  const raw = record(value, 'match', MATCH_KEYS);
  const rules = validateRules(raw['rules'], 'match.rules');
  const rotation = rules.match.rotation;
  if (raw['targetPoints'] !== rules.match.targetPoints) {
    fail('match.targetPoints', 'must equal rules.match.targetPoints');
  }
  const rawPlayers = record(raw['players'], 'match.players', PLAYERS);
  for (const p of PLAYERS) {
    const name = rawPlayers[p];
    if (typeof name !== 'string' || name.length === 0) {
      fail(`match.players.${p}`, 'expected a non-empty string');
    }
  }
  const players = { white: rawPlayers['white'] as string, black: rawPlayers['black'] as string };

  const rawGames = raw['games'];
  if (!Array.isArray(rawGames)) fail('match.games', 'expected an array');
  const status = raw['status'];
  if (status !== 'in-progress' && status !== 'finished') {
    fail('match.status', 'expected "in-progress" or "finished"');
  }
  const resignedBy = playerOrNull(raw['resignedBy'], 'match.resignedBy');
  const winner = playerOrNull(raw['winner'], 'match.winner');

  // Replay the games and compare the stored totals.
  const score = { white: 0, black: 0 };
  let reachedBy: PlayerId | null = null;
  const games: GameRecord[] = [];
  for (const [i, item] of (rawGames as unknown[]).entries()) {
    const path = `match.games[${i}]`;
    if (reachedBy !== null) fail(path, 'the match was already won before this game');
    const game = gameRecord(item, path, rotation[i % rotation.length] as VariantId);
    if (game.winner !== null) {
      score[game.winner] += game.points;
      if (score[game.winner] >= rules.match.targetPoints) reachedBy = game.winner;
    }
    games.push(game);
  }
  const rawScore = record(raw['score'], 'match.score', PLAYERS);
  for (const p of PLAYERS) {
    if (rawScore[p] !== score[p]) fail(`match.score.${p}`, `expected ${score[p]} (sum of games)`);
  }
  if (raw['rotationIndex'] !== games.length % rotation.length) {
    fail('match.rotationIndex', `expected ${games.length % rotation.length}`);
  }

  if (resignedBy !== null) {
    if (status !== 'finished') fail('match.status', 'a resigned match is finished');
    if (winner !== opponent(resignedBy)) fail('match.winner', 'the opponent of resignedBy wins');
    if (reachedBy !== null) fail('match.resignedBy', 'the match was already won');
  } else if (reachedBy !== null) {
    if (status !== 'finished') fail('match.status', 'a score reached the target');
    if (winner !== reachedBy) fail('match.winner', `expected "${reachedBy}"`);
  } else {
    if (status !== 'in-progress') fail('match.status', 'no score reached the target');
    if (winner !== null) fail('match.winner', 'expected null while the match is in progress');
  }

  const nextStarter = playerOrNull(raw['nextStarter'], 'match.nextStarter');
  const last = games[games.length - 1];
  const expectedStarter =
    status === 'finished' ? null : last === undefined ? nextStarter : starterAfter(rules, last);
  if (nextStarter !== expectedStarter) {
    fail('match.nextStarter', `expected ${JSON.stringify(expectedStarter)}`);
  }

  return {
    schemaVersion: MATCH_SCHEMA_VERSION,
    rules,
    targetPoints: rules.match.targetPoints,
    players,
    score,
    games,
    rotationIndex: games.length % rotation.length,
    nextStarter,
    status,
    winner,
    resignedBy,
  };
}
