/** Texts about a saved match for the "Continue game" card (wireframe 3). Pure. */
import type { TFunction } from 'i18next';

import type { SavedMatch } from './savedMatch';
import { seatsFor } from './seats';

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

export function continueSummary(saved: SavedMatch, t: TFunction, now: number): ContinueSummary {
  const { setup, flow } = saved;
  const seats = seatsFor(setup, t);
  const game = t(`games.${setup.game}`);
  return {
    game:
      setup.mode === 'bot'
        ? t('home.continue.vsBot', { game, level: t(`bot.levels.${setup.botLevel}`) })
        : t('home.continue.local', { game }),
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
