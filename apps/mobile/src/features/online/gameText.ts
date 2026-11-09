/**
 * The text of an online game that Home (#297) and History (#313) share.
 * Pure: no hooks, no React Native.
 */
import type { GameSummary } from '@tavli/contracts';
import type { TFunction } from 'i18next';

import { playerNameText } from './playerName';

/** "Portes vs Guest 4821" (#400), or "Portes vs friend" when the server has no name. */
export function gameTitle(game: GameSummary, t: TFunction): string {
  const name = playerNameText(game.opponentName, t);
  const choice = t(`games.${game.choice}`);
  return name === null
    ? t('home.online.vsFriend', { game: choice })
    : t('home.online.vsName', { game: choice, name });
}

/** "Waiting for Guest 4821", or "Waiting for your friend" when the server has no name. */
export function waitingText(game: GameSummary, t: TFunction): string {
  const name = playerNameText(game.opponentName, t);
  return name === null ? t('home.online.waiting') : t('home.online.waitingForName', { name });
}

/** "Guest 4821 won", or "Your friend won" when the server has no name. */
export function opponentWonText(game: GameSummary, t: TFunction): string {
  const name = playerNameText(game.opponentName, t);
  return name === null ? t('history.online.friendWon') : t('history.online.nameWon', { name });
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
