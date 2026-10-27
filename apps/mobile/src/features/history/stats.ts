/**
 * Simple stats from the match history (#142). Pure.
 *
 * Per game (Portes, Plakoto, Fevga, Tavli, Asodio) and per bot level:
 * - `played`: matches, finished or left;
 * - `won` / `lost`: finished matches the human won or lost (vs bot);
 * - `unfinished`: matches left for a new one (neither won nor lost);
 * - `winRate`: `won / (won + lost)`, a whole percent of finished matches,
 *   so it matches the Won and Lost numbers next to it;
 * - `diploWins`: games the human won with 2 points or more (mars);
 * - `draws`: drawn games. A draw is not a loss; it counts on its own.
 *
 * Pass-and-play has no "you", so its line per game has only `played` and
 * `draws`.
 */
import { BOT_DIFFICULTIES, type Difficulty } from '@tavli/contracts';

import { BOT_SIDE, GAME_CHOICES, HUMAN_SIDE, type GameChoice } from '@/features/match/setup';

import type { HistoryRecord } from './records';

export interface StatLine {
  readonly played: number;
  readonly won: number;
  readonly lost: number;
  readonly unfinished: number;
  readonly diploWins: number;
  readonly draws: number;
}

export interface LevelStats {
  readonly level: Difficulty;
  readonly line: StatLine;
}

export interface GameStats {
  readonly game: GameChoice;
  /** Bot levels with at least one match, easiest first. */
  readonly byLevel: readonly LevelStats[];
  /** Pass-and-play matches of this game, or `null` when there are none. */
  readonly local: StatLine | null;
}

export const EMPTY_LINE: StatLine = {
  played: 0,
  won: 0,
  lost: 0,
  unfinished: 0,
  diploWins: 0,
  draws: 0,
};

/** Won matches as a whole percent of finished ones (won + lost), or `null` with none finished. */
export function winRate(line: StatLine): number | null {
  const finished = line.won + line.lost;
  return finished === 0 ? null : Math.round((line.won / finished) * 100);
}

/** Adds one match to a line. Won, lost and mars wins are from the human's side (vs bot). */
function addTo(line: StatLine, record: HistoryRecord): StatLine {
  const bot = record.mode === 'bot';
  return {
    played: line.played + 1,
    won: line.won + (bot && record.winner === HUMAN_SIDE ? 1 : 0),
    lost: line.lost + (bot && record.winner === BOT_SIDE ? 1 : 0),
    unfinished: line.unfinished + (record.end === 'abandoned' ? 1 : 0),
    diploWins: line.diploWins + (bot ? record.diploWins[HUMAN_SIDE] : 0),
    draws: line.draws + record.draws,
  };
}

/** The lines of one game while `historyStats` adds them up. */
interface GameLines {
  readonly levels: Map<Difficulty, StatLine>;
  local: StatLine | null;
}

/**
 * Stats per game, in the picker's order, from one pass over the records.
 * Games with no match are left out.
 */
export function historyStats(records: readonly HistoryRecord[]): GameStats[] {
  const games = new Map<GameChoice, GameLines>();
  for (const record of records) {
    let lines = games.get(record.game);
    if (!lines) {
      lines = { levels: new Map(), local: null };
      games.set(record.game, lines);
    }
    if (record.mode === 'local') {
      lines.local = addTo(lines.local ?? EMPTY_LINE, record);
    } else if (record.botLevel !== null) {
      const level = record.botLevel;
      lines.levels.set(level, addTo(lines.levels.get(level) ?? EMPTY_LINE, record));
    }
  }
  return GAME_CHOICES.flatMap((game) => {
    const lines = games.get(game);
    if (!lines) return [];
    const byLevel = BOT_DIFFICULTIES.flatMap((level) => {
      const line = lines.levels.get(level);
      return line ? [{ level, line }] : [];
    });
    return [{ game, byLevel, local: lines.local }];
  });
}
