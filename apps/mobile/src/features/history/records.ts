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
 *   player resigned the match (`resignedBy`);
 * - when a new match replaces one that had started (`end: 'abandoned'`):
 *   it has no winner.
 */
import { isDifficulty, type Difficulty } from '@tavli/contracts';
import { type Match, type PerPlayer, type PlayerId } from '@tavli/engine';

import {
  isGameChoice,
  isMatchMode,
  type GameChoice,
  type MatchMode,
  type MatchSetup,
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
  readonly targetPoints: number;
  /** The final score (or the score when the match was left). */
  readonly score: PerPlayer<number>;
  readonly end: MatchEnd;
  /** The match winner; `null` when the match was left. */
  readonly winner: PlayerId | null;
  /** The player who resigned the match, or `null`. */
  readonly resignedBy: PlayerId | null;
  /** Finished games in the match. */
  readonly games: number;
  /** Games each player won with 2 points or more (diplo, "mars"). */
  readonly diploWins: PerPlayer<number>;
  /** Games that ended in a draw (Plakoto: both mothers pinned; Asodio: deadlock). */
  readonly draws: number;
}

/** The record of a match that ends now (`end: 'finished'`) or is left (`'abandoned'`). */
export function historyRecord(
  sessionId: string,
  setup: MatchSetup,
  match: Match,
  endedAt: number,
  end: MatchEnd,
): HistoryRecord {
  const diploWins = { white: 0, black: 0 };
  let draws = 0;
  for (const game of match.games) {
    if (game.winner === null) draws += 1;
    else if (game.points >= 2) diploWins[game.winner] += 1;
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
    games: match.games.length,
    diploWins,
    draws,
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
    games,
    diploWins,
    draws,
  };
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
