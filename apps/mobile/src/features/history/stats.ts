/**
 * Simple stats from the match history (#142). Pure.
 *
 * Per game (Portes, Plakoto, Fevga, Tavli, Asodio) and per bot level:
 * - `played`: matches, finished or left;
 * - `won` / `lost`: finished matches the human won or lost (vs bot);
 * - `unfinished`: matches left for a new one (neither won nor lost);
 * - `winRate`: `won / played`, a whole percent;
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

/** Won matches as a whole percent of played ones, or `null` with none played. */
export function winRate(line: StatLine): number | null {
  return line.played === 0 ? null : Math.round((line.won / line.played) * 100);
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

/** Stats per game, in the picker's order. Games with no match are left out. */
export function historyStats(records: readonly HistoryRecord[]): GameStats[] {
  return GAME_CHOICES.flatMap((game) => {
    const mine = records.filter((r) => r.game === game);
    if (mine.length === 0) return [];
    const byLevel = BOT_DIFFICULTIES.flatMap((level) => {
      const atLevel = mine.filter((r) => r.mode === 'bot' && r.botLevel === level);
      return atLevel.length === 0 ? [] : [{ level, line: atLevel.reduce(addTo, EMPTY_LINE) }];
    });
    const local = mine.filter((r) => r.mode === 'local');
    return [{ game, byLevel, local: local.length === 0 ? null : local.reduce(addTo, EMPTY_LINE) }];
  });
}
