/** Texts of the history screen (#142). Pure. */
import type { TFunction } from 'i18next';

import { seatsFor } from '@/features/match/seats';
import {
  HUMAN_SIDE,
  defaultSetup,
  type MatchLength,
  type MatchSetup,
} from '@/features/match/setup';
import { matchLabel } from '@/features/match/summary';

import type { HistoryRecord } from './records';
import { winRate, type StatLine } from './stats';

/** The setup a record came from, for the texts the app already has (seats, labels). */
function recordSetup(record: HistoryRecord): MatchSetup {
  return {
    ...defaultSetup(record.mode),
    game: record.game,
    targetPoints: record.targetPoints as MatchLength,
    botLevel: record.botLevel ?? 'easy',
    names: record.names,
  };
}

/** `won`, `lost` or `unfinished` vs the bot; `winner` (a name) or `unfinished` in pass-and-play. */
export type ResultBadge = 'won' | 'lost' | 'unfinished' | 'winner';

export interface HistoryRow {
  /** "Portes · vs Bot (Easy)" or "Portes · pass-and-play". */
  readonly title: string;
  /** "You 3 – 1 Bot · first to 3". */
  readonly score: string;
  readonly badge: ResultBadge;
  /** "Won", "Lost", "Not finished" or "Maria won". */
  readonly result: string;
  readonly date: string;
  /** All of it, for screen readers: one label per row. */
  readonly label: string;
}

/**
 * The locale for dates: the phone's locale when it speaks the app language
 * (so `en-GB` keeps day-month order), else the app language.
 */
export function dateLocale(
  language: string,
  phone: readonly { languageCode?: string | null; languageTag?: string | null }[],
): string {
  const match = phone.find((locale) => locale.languageCode === language && locale.languageTag);
  return match?.languageTag ?? language;
}

/**
 * The date in `locale`: "Oct 27, 2026" in `en-US`, "27 Oct 2026" in
 * `en-GB`. A locale the phone cannot format gives the ISO date
 * ("2026-10-27"). Never throws: a time that is not a valid date gives "".
 */
export function formatDate(ms: number, locale: string): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    try {
      return date.toISOString().slice(0, 10);
    } catch {
      return '';
    }
  }
}

export function historyRow(record: HistoryRecord, t: TFunction, locale: string): HistoryRow {
  const setup = recordSetup(record);
  const seats = seatsFor(setup, t);
  const title = matchLabel(setup, t);
  const score = [
    t('game.end.score', {
      white: seats.white.name,
      black: seats.black.name,
      whiteScore: record.score.white,
      blackScore: record.score.black,
    }),
    t('home.continue.target', { target: record.targetPoints }),
  ].join(' · ');
  let badge: ResultBadge;
  if (record.winner === null) badge = 'unfinished';
  else if (record.mode === 'local') badge = 'winner';
  else badge = record.winner === HUMAN_SIDE ? 'won' : 'lost';
  const result =
    badge === 'winner' && record.winner !== null
      ? t('history.result.winner', { name: seats[record.winner].name })
      : t(`history.result.${badge as Exclude<ResultBadge, 'winner'>}`);
  const date = formatDate(record.endedAt, locale);
  const label = [title, score, result, date].filter(Boolean).join(', ');
  return { title, score, badge, result, date, label };
}

/**
 * "Played 5 · Won 3 · Lost 1 · 60% won · Diplo wins 1 · Draws 0" vs the bot;
 * "Played 4 · Draws 1" in pass-and-play. "Not finished" shows only when some were.
 */
export function statParts(line: StatLine, mode: 'bot' | 'local', t: TFunction): string[] {
  const parts = [t('history.line.played', { value: line.played })];
  if (mode === 'bot') {
    parts.push(
      t('history.line.won', { value: line.won }),
      t('history.line.lost', { value: line.lost }),
      t('history.line.winRate', { value: winRate(line) ?? 0 }),
      t('history.line.diplo', { value: line.diploWins }),
    );
  }
  parts.push(t('history.line.draws', { value: line.draws }));
  if (line.unfinished > 0) parts.push(t('history.line.unfinished', { value: line.unfinished }));
  return parts;
}
