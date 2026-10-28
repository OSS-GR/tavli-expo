/** The seats of an online game (#255): "You" and "Opponent". */
import type { PerPlayer, PlayerId } from '@tavli/engine';
import type { TFunction } from 'i18next';

import type { Seat } from '@/features/game/seats';

export function onlineSeats(me: PlayerId, t: TFunction): PerPlayer<Seat> {
  const you: Seat = {
    name: t('game.you'),
    label: t('game.you'),
    turnLabel: t('game.strip.turn'),
    you: true,
  };
  // The other player plays on another phone: their pill says the server waits for them.
  const opponent: Seat = {
    name: t('online.opponent'),
    label: t('online.opponent'),
    turnLabel: t('online.waiting'),
    you: false,
  };
  return me === 'white' ? { white: you, black: opponent } : { white: opponent, black: you };
}
