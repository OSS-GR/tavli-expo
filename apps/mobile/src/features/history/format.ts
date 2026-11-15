/** Texts of the history screen (#142). Pure. */
import type { GameSummary } from '@tavli/contracts';
import type { TFunction } from 'i18next';

import { seatsFor } from '@/features/match/seats';
import {
  DEFAULT_OPENING_ROLL,
  HUMAN_SIDE,
  VERSION_KEYS,
  defaultSetup,
  gamePreset,
  isMatchLength,
  isOpeningRollRule,
  otherVersion,
  versionsOfPreset,
  type MatchSetup,
} from '@/features/match/setup';
import { matchLabel } from '@/features/match/summary';
import { gameScore, gameTitle, opponentWonText } from '@/features/online/gameText';

import type { HistoryRecord } from './records';
import { winRate, type StatLine } from './stats';

/**
 * The setup a record came from, for the texts the app already has (seats,
 * labels). A length the new-game screen does not offer gets the default
 * here; the row still shows the real one ("first to 9"). It keeps the
 * record's opening roll house rule (#207), so the setup is correct; an
 * unknown rule gets the federation rule, as in `records.ts`. It keeps the
 * record's rules version (#241) too; one that is not the game's gets the
 * default.
 */
export function recordSetup(record: HistoryRecord): MatchSetup {
  const base = defaultSetup(record.mode);
  const { game, preset } = record;
  const rulesVersions = versionsOfPreset(game, preset, base.rulesVersions);
  return {
    ...base,
    game,
    targetPoints: isMatchLength(record.targetPoints) ? record.targetPoints : base.targetPoints,
    botLevel: record.botLevel ?? 'easy',
    names: record.names,
    openingRoll: isOpeningRollRule(record.openingRoll) ? record.openingRoll : DEFAULT_OPENING_ROLL,
    rulesVersions,
  };
}

/** `won`, `lost` or `unfinished` vs the bot; `winner` (a name) or `unfinished` in pass-and-play. */
export type ResultBadge = 'won' | 'lost' | 'unfinished' | 'winner';

export interface HistoryRow {
  /** "Portes · vs Bot (Easy)" or "Portes · pass-and-play". */
  readonly title: string;
  /**
   * "You 3 – 1 Bot · first to 3". A house rule follows the length, with
   * New game's short label: "· Opening roll: Roll again" (#221), "· Rules
   * version: Federation" (#241), in a Tavli match "· Rules version
   * (Plakoto): Federation" (#247).
   */
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
  const version = otherVersion(gamePreset(setup.game, setup.rulesVersions));
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
    // The opening roll house rule (#221); the federation rule shows nothing.
    setup.openingRoll === DEFAULT_OPENING_ROLL
      ? null
      : t('history.openingRoll', { rule: t(`newGame.houseRules.${setup.openingRoll}`) }),
    // The rules version (#241); the default preset shows nothing.
    version === null
      ? null
      : t('history.rulesVersion', {
          version: t(`newGame.rulesVersion.${VERSION_KEYS[version]}`),
        }),
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

export interface OnlineHistoryRow {
  /** "Portes vs friend", as on Home. */
  readonly title: string;
  /** Your points first: "3–1 · first to 5". */
  readonly score: string;
  /** `won` or `lost`; `null` when the server gives no winner. */
  readonly badge: 'won' | 'lost' | null;
  /** "You won" or "Your friend won"; `null` with no winner. */
  readonly result: string | null;
  /** The day of the last change: the end of the match. */
  readonly date: string;
  /** All of it, for screen readers: "Portes vs friend, 3 to 1, first to 5, You won, Oct 28, 2026". */
  readonly label: string;
}

/**
 * One finished online match (#313). The other player has their name
 * ("Guest 4821", #400), or is "your friend" when the server has none, as
 * on Home.
 */
export function onlineHistoryRow(
  game: GameSummary,
  t: TFunction,
  locale: string,
): OnlineHistoryRow {
  const title = gameTitle(game, t);
  const score = gameScore(game, t);
  const target = t('home.continue.target', { target: game.targetPoints });
  const badge = game.winner === null ? null : game.winner === game.mySide ? 'won' : 'lost';
  const result =
    badge === null ? null : badge === 'won' ? t('history.online.youWon') : opponentWonText(game, t);
  const date = formatDate(game.updatedAt, locale);
  const label = [title, score.spoken, target, result, date].filter(Boolean).join(', ');
  return { title, score: `${score.text} · ${target}`, badge, result, date, label };
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
  return statValues(line, mode).map(({ key, value }) => t(`history.line.${key}`, { value }));
}

type StatKey = 'played' | 'won' | 'lost' | 'winRate' | 'diplo' | 'draws' | 'unfinished';

/** The numbers of `statParts`, in its order, with the key of each text. */
function statValues(
  line: StatLine,
  mode: 'bot' | 'local',
): { key: StatKey; value: string | number }[] {
  const values: { key: StatKey; value: string | number }[] = [
    { key: 'played', value: line.played },
  ];
  if (mode === 'bot') {
    values.push(
      { key: 'won', value: line.won },
      { key: 'lost', value: line.lost },
      { key: 'winRate', value: rateText(winRate(line)) },
      { key: 'diplo', value: line.diploWins },
    );
  }
  values.push({ key: 'draws', value: line.draws });
  if (line.unfinished > 0) values.push({ key: 'unfinished', value: line.unfinished });
  return values;
}

/** The stats that show as tiles (#359); the others go in one line under them. */
const TILE_KEYS: ReadonlySet<StatKey> = new Set(['played', 'won', 'winRate']);

/** One big number of the stats (#359): "24" over "Played". */
export interface StatTile {
  readonly key: StatKey;
  /** "24", "75%" or "—". */
  readonly value: string;
  /** The stat's own text without the number: "Played", "Win rate". */
  readonly label: string;
}

/** Stands in for the number, so the label keeps the language's own words. */
const VALUE_SLOT = '\u0000';

/**
 * The stats of one line as tiles and one line of the rest (#359). Vs the
 * bot: Played, Won and Win rate as tiles, then "Lost 1 · Diplo wins 1 ·
 * Draws 0". Pass-and-play has no "you": a Played tile, then "Draws 1".
 * The texts are the ones of `statParts`: a tile's label is its text
 * without the number ("Played {{value}}" gives "Played"), wherever the
 * number sits in the language.
 */
export function statTiles(
  line: StatLine,
  mode: 'bot' | 'local',
  t: TFunction,
): { tiles: StatTile[]; rest: string[] } {
  const tiles: StatTile[] = [];
  const rest: string[] = [];
  for (const { key, value } of statValues(line, mode)) {
    if (TILE_KEYS.has(key)) {
      const label = t(`history.line.${key}`, { value: VALUE_SLOT })
        .replace(VALUE_SLOT, '')
        .replace(/\s+/g, ' ')
        .trim();
      tiles.push({ key, value: String(value), label });
    } else {
      rest.push(t(`history.line.${key}`, { value }));
    }
  }
  return { tiles, rest };
}
