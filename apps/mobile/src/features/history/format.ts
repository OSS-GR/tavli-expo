/** Texts of the history screen (#142). Pure. */
import type { TFunction } from 'i18next';

import { seatsFor } from '@/features/match/seats';
import { HUMAN_SIDE, defaultSetup, isMatchLength, type MatchSetup } from '@/features/match/setup';
import { matchLabel } from '@/features/match/summary';

import type { HistoryRecord } from './records';
import { winRate, type StatLine } from './stats';

/**
 * The setup a record came from, for the texts the app already has (seats,
 * labels). A length the new-game screen does not offer gets the default
 * here; the row still shows the real one ("first to 9").
 */
function recordSetup(record: HistoryRecord): MatchSetup {
  const base = defaultSetup(record.mode);
  return {
    ...base,
    game: record.game,
    targetPoints: isMatchLength(record.targetPoints) ? record.targetPoints : base.targetPoints,
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
  /** "Won", "Lost", "Not finished" or "Maria won"; "Lost on time" after a time-out (#170). */
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

/** One date formatter per locale (making one is slow); `null` when the locale fails. */
const dateFormats = new Map<string, Intl.DateTimeFormat | null>();

function dateFormat(locale: string): Intl.DateTimeFormat | null {
  if (!dateFormats.has(locale)) {
    let format: Intl.DateTimeFormat | null;
    try {
      format = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      format = null;
    }
    dateFormats.set(locale, format);
  }
  return dateFormats.get(locale) ?? null;
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
    const format = dateFormat(locale);
    if (format) return format.format(date);
  } catch {
    // Fall back to the ISO date below.
  }
  try {
    return date.toISOString().slice(0, 10);
  } catch {
    return '';
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
    // A resigned match keeps its score (#181): say who resigned it.
    record.resignedBy === null
      ? null
      : seats[record.resignedBy].you
        ? t('history.resigned_you')
        : t('history.resigned', { name: seats[record.resignedBy].name }),
  ]
    .filter(Boolean)
    .join(' · ');
  let badge: ResultBadge;
  if (record.winner === null) badge = 'unfinished';
  else if (record.mode === 'local') badge = 'winner';
  else badge = record.winner === HUMAN_SIDE ? 'won' : 'lost';
  // A match lost on time says so (#170): "Won on time", "Maria won on time".
  const onTime = record.timedOutBy !== null;
  let result: string;
  if (badge === 'winner' && record.winner !== null) {
    const name = seats[record.winner].name;
    result = onTime
      ? t('history.result.winnerOnTime', { name })
      : t('history.result.winner', { name });
  } else if (onTime && badge === 'won') {
    result = t('history.result.wonOnTime');
  } else if (onTime && badge === 'lost') {
    result = t('history.result.lostOnTime');
  } else {
    result = t(`history.result.${badge as Exclude<ResultBadge, 'winner'>}`);
  }
  const date = formatDate(record.endedAt, locale);
  const label = [title, score, result, date].filter(Boolean).join(', ');
  return { title, score, badge, result, date, label };
}

/** "75%", or "—" when there is no rate yet. */
function rateText(rate: number | null): string {
  return rate === null ? '—' : `${rate}%`;
}

/**
 * "Played 5 · Won 3 · Lost 1 · Win rate 75% · Diplo wins 1 · Draws 0" vs
 * the bot ("Win rate —" before a match is won or lost);
 * "Played 4 · Draws 1" in pass-and-play. "Not finished" shows only when some were.
 */
export function statParts(line: StatLine, mode: 'bot' | 'local', t: TFunction): string[] {
  const parts = [t('history.line.played', { value: line.played })];
  if (mode === 'bot') {
    parts.push(
      t('history.line.won', { value: line.won }),
      t('history.line.lost', { value: line.lost }),
      t('history.line.winRate', { value: rateText(winRate(line)) }),
      t('history.line.diplo', { value: line.diploWins }),
    );
  }
  parts.push(t('history.line.draws', { value: line.draws }));
  if (line.unfinished > 0) parts.push(t('history.line.unfinished', { value: line.unfinished }));
  return parts;
}
