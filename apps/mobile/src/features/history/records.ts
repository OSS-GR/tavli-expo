/**
 * Match history (#142): one small record per local match that ended or was
 * left. Pure.
 *
 * Saved as JSON under `HISTORY_STORAGE_KEY` in the `Storage` port:
 * `{ v: 1, records: [...] }`, newest first, at most `MAX_HISTORY_RECORDS`.
 * The data never leaves the phone, so it needs no consent. It does not
 * touch the save slot of the match in play (`savedMatch.ts`).
 *
 * A record is written:
 * - when a match is over (`end: 'finished'`): won to the target, or a
 *   player resigned the match (`resignedBy`), or lost it on time
 *   (`timedOutBy`, #170);
 * - when a new match replaces one that had started (`end: 'abandoned'`):
 *   it has no winner.
 */
import { isDifficulty, type Difficulty } from '@tavli/contracts';
import {
  CHECKERS_PER_PLAYER,
  type GameRecord,
  type Match,
  type PerPlayer,
  type PlayerId,
  type PresetId,
  type RuleSet,
} from '@tavli/engine';

import { timedOutBy } from '@/features/match/summary';
import {
  DEFAULT_OPENING_ROLL,
  gamePreset,
  isGameChoice,
  isMatchMode,
  isOpeningRollRule,
  isRulesVersion,
  isVersionedGame,
  type GameChoice,
  type MatchMode,
  type MatchSetup,
  type OpeningRollRule,
} from '@/features/match/setup';

export const HISTORY_STORAGE_KEY = 'history';

/** Raise this when the record shape changes. */
export const HISTORY_VERSION = 1;

/** The newest records we keep. Older ones are dropped. */
export const MAX_HISTORY_RECORDS = 200;

/** `finished`: the match is over. `abandoned`: the player left it for a new one. */
export type MatchEnd = 'finished' | 'abandoned';

export interface HistoryRecord {
  /** Unique on this phone. A rematch keeps the session id, so the time is part of it. */
  readonly id: string;
  /** When the match ended or was left (ms since 1970). */
  readonly endedAt: number;
  readonly mode: MatchMode;
  readonly game: GameChoice;
  /** Vs bot only; `null` in pass-and-play. */
  readonly botLevel: Difficulty | null;
  /** Pass-and-play names as typed. Empty = "Player 1" / "Player 2". Empty vs bot. */
  readonly names: PerPlayer<string>;
  /**
   * The match length. Usually one of the new-game lengths, but any positive
   * whole number loads, so an old record is never dropped for it. The texts
   * check it (`format.ts`).
   */
  readonly targetPoints: number;
  /** The final score (or the score when the match was left). */
  readonly score: PerPlayer<number>;
  readonly end: MatchEnd;
  /** The match winner; `null` when the match was left. */
  readonly winner: PlayerId | null;
  /** The player who resigned the match, or `null`. */
  readonly resignedBy: PlayerId | null;
  /**
   * The player who lost the match on time: their turn timer ran out in the
   * last game (#170, `timedOutBy` in `features/match/summary.ts`). `null`
   * otherwise, and in records made before #170.
   */
  readonly timedOutBy: PlayerId | null;
  /** Finished games in the match. */
  readonly games: number;
  /** Games each player won with 2 points or more (diplo, "mars"; see `isDiplo`). */
  readonly diploWins: PerPlayer<number>;
  /** Games that ended in a draw (Plakoto: both mothers pinned; Asodio: deadlock). */
  readonly draws: number;
  /**
   * The match within its session (1, then 2 after a rematch, …; see
   * `savedMatch.ts`). `null` in records made before #150.
   */
  readonly matchNumber: number | null;
  /**
   * The opening roll house rule of the match (#207), from its rules.
   * Records made before #207 (or with an unknown rule) load with the
   * federation rule (`useOpeningDice`), the only rule the app had then.
   */
  readonly openingRoll: OpeningRollRule;
  /**
   * The engine preset of the match (#241, `match.rules.presetId`): the
   * rules version of Plakoto and Asodio, else the game's one preset
   * (`tavli` for a Tavli match). Records made before #241 (or with a
   * preset that is not one of the game's) load with the default preset.
   */
  readonly preset: PresetId;
}

/**
 * Is a won game a diplo (mars)? It depends on the scoring of its rules
 * (`scoring.method`):
 *
 * - `tavli` (every game but Acey-Deucey American; `docs/rules/tavli-match.md`,
 *   "Winning & scoring"): a single is 1 point, a double is 2. Every way to a
 *   double gives 2: no checker borne off, a pinned mother (Plakoto), or a
 *   resign or a timeout in such a position (the opponent wins what the
 *   position is worth, `resignGame`). Only the `backgammonScores3` flag
 *   (Portes, off by default) gives 3, and that is a double too.
 * - `perChecker` (Acey-Deucey American, #241): 1 point per checker the
 *   loser has not borne off. Only a loser with none off gives a diplo: 15.
 * - `singleOnly`: every win is 1 point, never a diplo.
 *
 * A draw is 0 points.
 */
export function isDiplo(
  game: GameRecord,
  scoring: RuleSet['scoring']['method'] = 'tavli',
): boolean {
  if (game.winner === null) return false;
  switch (scoring) {
    case 'tavli':
      return game.points >= 2;
    case 'perChecker':
      return game.points >= CHECKERS_PER_PLAYER;
    case 'singleOnly':
      return false;
  }
}

/**
 * The record of a match that ends now (`end: 'finished'`) or is left
 * (`'abandoned'`). `matchNumber` is the match within the session.
 */
export function historyRecord(
  sessionId: string,
  setup: MatchSetup,
  match: Match,
  endedAt: number,
  end: MatchEnd,
  matchNumber: number | null,
): HistoryRecord {
  const diploWins = { white: 0, black: 0 };
  let draws = 0;
  // Every game of an app match scores like the match rules: a one-game
  // match plays its preset, and a Tavli match only games with Tavli scoring.
  const scoring = match.rules.scoring.method;
  for (const game of match.games) {
    if (game.winner === null) draws += 1;
    else if (isDiplo(game, scoring)) diploWins[game.winner] += 1;
  }
  const bot = setup.mode === 'bot';
  return {
    id: `${sessionId}@${endedAt}`,
    endedAt,
    mode: setup.mode,
    game: setup.game,
    botLevel: bot ? setup.botLevel : null,
    names: bot ? { white: '', black: '' } : { ...setup.names },
    targetPoints: match.targetPoints,
    score: { ...match.score },
    end,
    winner: end === 'finished' ? match.winner : null,
    resignedBy: match.resignedBy,
    timedOutBy: end === 'finished' ? timedOutBy(match) : null,
    games: match.games.length,
    diploWins,
    draws,
    matchNumber,
    openingRoll: match.rules.match.openingRoll,
    preset: match.rules.presetId,
  };
}

/** Adds `record` as the newest one and keeps at most `max`. A record with the same id is replaced. */
export function addRecord(
  records: readonly HistoryRecord[],
  record: HistoryRecord,
  max: number = MAX_HISTORY_RECORDS,
): HistoryRecord[] {
  return [record, ...records.filter((r) => r.id !== record.id)].slice(0, max);
}

/**
 * Is match `matchNumber` of session `sessionId` in the history (finished or
 * left)? The record id is `<session id>@<endedAt>` (`historyRecord`). No
 * clock is compared: a set-back clock cannot make a rematch look recorded.
 */
export function hasMatchRecord(
  records: readonly HistoryRecord[],
  sessionId: string,
  matchNumber: number,
): boolean {
  const prefix = `${sessionId}@`;
  return records.some((r) => r.matchNumber === matchNumber && r.id.startsWith(prefix));
}

export function serializeHistory(records: readonly HistoryRecord[]): string {
  return JSON.stringify({ v: HISTORY_VERSION, records });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const isPlayer = (value: unknown): value is PlayerId => value === 'white' || value === 'black';

function perPlayer<T>(value: unknown, check: (v: unknown) => v is T): PerPlayer<T> | null {
  if (!isRecord(value)) return null;
  const white = value['white'];
  const black = value['black'];
  return check(white) && check(black) ? { white, black } : null;
}

const isString = (value: unknown): value is string => typeof value === 'string';

/** A time that makes a valid `Date` (1970 or later). `1e20` would not: it cannot be shown. */
function isDateMs(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    !Number.isNaN(new Date(value).getTime())
  );
}

/** One saved record, or `null` when any field is wrong. */
function parseRecord(raw: unknown): HistoryRecord | null {
  if (!isRecord(raw)) return null;
  const { id, endedAt, mode, game, botLevel, targetPoints, end, winner, resignedBy, games, draws } =
    raw;
  const names = perPlayer(raw['names'], isString);
  const score = perPlayer(raw['score'], isCount);
  const diploWins = perPlayer(raw['diploWins'], isCount);
  if (typeof id !== 'string' || id.length === 0) return null;
  if (!isDateMs(endedAt)) return null;
  if (!isMatchMode(mode) || !isGameChoice(game)) return null;
  if (mode === 'bot' ? !isDifficulty(botLevel) : botLevel !== null) return null;
  if (!isCount(targetPoints) || targetPoints < 1) return null;
  if (end !== 'finished' && end !== 'abandoned') return null;
  if (end === 'finished' ? !isPlayer(winner) : winner !== null) return null;
  if (resignedBy !== null && !isPlayer(resignedBy)) return null;
  if (!isCount(games) || !isCount(draws)) return null;
  if (names === null || score === null || diploWins === null) return null;
  // Records before #150 have no match number.
  const number = raw['matchNumber'];
  const matchNumber = number === undefined || number === null ? null : number;
  if (matchNumber !== null && (!isCount(matchNumber) || matchNumber < 1)) return null;
  // Records before #170 have no time-out. Only the loser of a finished match can have one,
  // and a match ends one way: on time or by a resign, never both.
  const lostOnTime = raw['timedOutBy'] ?? null;
  if (
    lostOnTime !== null &&
    (!isPlayer(lostOnTime) || end !== 'finished' || lostOnTime === winner || resignedBy !== null)
  ) {
    return null;
  }
  // Records before #207 have no opening roll rule: the federation rule. An
  // unknown one gets it too: the rule is a detail, never a reason to lose a match.
  const opening = isOpeningRollRule(raw['openingRoll']) ? raw['openingRoll'] : DEFAULT_OPENING_ROLL;
  // Records before #241 have no preset: the game's default. So does a
  // preset that is not one of the game's: it is a detail too.
  const preset = recordPreset(game, raw['preset']);
  return {
    id,
    endedAt,
    mode,
    game,
    botLevel: mode === 'bot' ? (botLevel as Difficulty) : null,
    names,
    targetPoints,
    score,
    end,
    winner: winner as PlayerId | null,
    resignedBy,
    timedOutBy: lostOnTime,
    games,
    diploWins,
    draws,
    matchNumber,
    openingRoll: opening,
    preset,
  };
}

/** `raw` when it is a preset a match of `game` can have, else the game's default preset. */
export function recordPreset(game: GameChoice, raw: unknown): PresetId {
  if (isVersionedGame(game) && isRulesVersion(game, raw)) return raw;
  return gamePreset(game);
}

/**
 * Reads the saved history in its stored order (newest first, as `addRecord`
 * writes it; the clock may have moved back, so it is not sorted by time),
 * at most `MAX_HISTORY_RECORDS`. Never throws: bad JSON or another
 * version gives an empty list; a bad record is dropped, the rest stay. Ids
 * are unique (they are the list keys): of two records with one id, the
 * first (newest) stays.
 */
export function parseHistory(text: string | undefined): HistoryRecord[] {
  if (text === undefined) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }
  if (!isRecord(raw) || raw['v'] !== HISTORY_VERSION || !Array.isArray(raw['records'])) return [];
  const records = raw['records'].map(parseRecord).filter((r): r is HistoryRecord => r !== null);
  const seen = new Set<string>();
  const unique = records.filter((r) => !seen.has(r.id) && seen.add(r.id));
  return unique.slice(0, MAX_HISTORY_RECORDS);
}
