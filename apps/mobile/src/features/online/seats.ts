/**
 * The seats of an online game (#255): "You" and the other player's name
 * ("Guest 4821", #400), or "Opponent" when the server has no name.
 */
import type { PlayerName } from '@tavli/contracts';
import type { PerPlayer, PlayerId } from '@tavli/engine';
import type { TFunction } from 'i18next';

import type { Seat } from '@/features/game/seats';

import { playerNameText } from './playerName';

export function onlineSeats(
  me: PlayerId,
  t: TFunction,
  opponentName: PlayerName | null,
): PerPlayer<Seat> {
  const you: Seat = {
    name: t('game.you'),
    label: t('game.you'),
    turnLabel: t('game.strip.turn'),
    you: true,
  };
  // The other player plays on another phone: their pill says the server waits for them.
  const named = playerNameText(opponentName, t);
  const opponent: Seat = {
    name: named ?? t('online.opponent'),
    label: named ?? t('online.opponent'),
    turnLabel: named === null ? t('online.waiting') : t('online.waitingForName', { name: named }),
    you: false,
  };
  return me === 'white' ? { white: you, black: opponent } : { white: opponent, black: you };
}
