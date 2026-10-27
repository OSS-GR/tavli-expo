/** Texts about a match: the "Continue game" card (wireframe 3) and match end (9). Pure. */
import {
  nextVariantId,
  type Match,
  type MatchFlow,
  type PlayerId,
  type VariantId,
} from '@tavli/engine';
import type { TFunction } from 'i18next';

import type { SavedMatch } from './savedMatch';
import { seatsFor } from './seats';
import { isGameChoice, type MatchSetup } from './setup';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "12 min ago", "3 h ago", "2 days ago". */
export function timeAgo(ms: number, t: TFunction): string {
  if (ms < MINUTE) return t('time.justNow');
  if (ms < HOUR) return t('time.minutesAgo', { count: Math.floor(ms / MINUTE) });
  if (ms < DAY) return t('time.hoursAgo', { count: Math.floor(ms / HOUR) });
  return t('time.daysAgo', { count: Math.floor(ms / DAY) });
}

export interface ContinueSummary {
  /** "Portes · vs Bot (Easy)" or "Portes · pass-and-play". */
  readonly game: string;
  /** "You 1 – 0 Bot · first to 3 · 12 min ago". */
  readonly status: string;
}

/** "Portes · vs Bot (Easy)" or "Portes · pass-and-play". */
export function matchLabel(setup: MatchSetup, t: TFunction): string {
  const game = t(`games.${setup.game}`);
  return setup.mode === 'bot'
    ? t('home.continue.vsBot', { game, level: t(`bot.levels.${setup.botLevel}`) })
    : t('home.continue.local', { game });
}

export function continueSummary(saved: SavedMatch, t: TFunction, now: number): ContinueSummary {
  const { setup, flow } = saved;
  const seats = seatsFor(setup, t);
  return {
    game: matchLabel(setup, t),
    status: [
      t('game.end.score', {
        white: seats.white.name,
        black: seats.black.name,
        whiteScore: flow.match.score.white,
        blackScore: flow.match.score.black,
      }),
      t('home.continue.target', { target: flow.match.targetPoints }),
      timeAgo(Math.max(0, now - saved.savedAt), t),
    ].join(' · '),
  };
}

/** "Plakoto". An id the app does not know shows as it is. */
export function variantName(variant: VariantId, t: TFunction): string {
  return isGameChoice(variant) ? t(`games.${variant}`) : variant;
}

/** The number of the game on the board, from 1. A finished game is in `match.games` already. */
export function currentGameNumber(flow: MatchFlow): number {
  const { games } = flow.match;
  return flow.game.phase === 'game-over' ? games.length : games.length + 1;
}

/** The game on the board (#109): "Game 2 · Plakoto". */
export function currentGameLabel(flow: MatchFlow, t: TFunction): string {
  return t('game.round', {
    number: currentGameNumber(flow),
    game: variantName(flow.game.state.variant, t),
  });
}

/** After a game end, the game that comes next: "Next: game 3 · Fevga". */
export function nextGameLabel(match: Match, t: TFunction): string {
  return t('game.end.nextGame', {
    number: match.games.length + 1,
    game: variantName(nextVariantId(match), t),
  });
}

/**
 * The player who lost the match on time (#170): the last game ended because
 * their online turn timer ran out, and that game ended the match. `null`
 * for a match that is not over, was resigned (`resignedBy`), or was won
 * another way.
 */
export function timedOutBy(match: Match): PlayerId | null {
  if (match.status !== 'finished' || match.resignedBy !== null) return null;
  const last = match.games.at(-1);
  if (last?.reason !== 'timeout' || last.winner === null) return null;
  return last.winner === 'white' ? 'black' : 'white';
}
