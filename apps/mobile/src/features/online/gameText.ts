/**
 * The text of an online game that Home (#297) and History (#313) share.
 * Pure: no hooks, no React Native.
 */
import type { GameSummary } from '@tavli/contracts';
import type { TFunction } from 'i18next';

/** "Portes vs friend". */
export function gameTitle(game: GameSummary, t: TFunction): string {
  return t('home.online.vsFriend', { game: t(`games.${game.choice}`) });
}

/** The score, your points first: "3–1" to show, "3 to 1" to read. */
export function gameScore(game: GameSummary, t: TFunction): { text: string; spoken: string } {
  const me = game.score[game.mySide];
  const friend = game.score[game.mySide === 'white' ? 'black' : 'white'];
  return {
    text: t('home.online.score', { me, friend }),
    spoken: t('home.online.scoreSpoken', { me, friend }),
  };
}
