/** The seats of a local match, from its setup, in the app language. */
import type { PerPlayer } from '@tavli/engine';
import type { TFunction } from 'i18next';

import type { Seat } from '@/features/game/seats';

import type { MatchSetup } from './setup';

export function seatsFor(setup: MatchSetup, t: TFunction): PerPlayer<Seat> {
  if (setup.mode === 'bot') {
    // The human is White, the bot Black (`HUMAN_SIDE`, `BOT_SIDE`).
    const level = t(`bot.levels.${setup.botLevel}`);
    return {
      white: {
        name: t('game.you'),
        label: t('game.you'),
        turnLabel: t('game.strip.turn'),
        you: true,
      },
      black: {
        name: t('game.bot.name'),
        label: t('game.bot.strip', { level }),
        turnLabel: t('game.strip.playing'),
        you: false,
      },
    };
  }
  // Pass-and-play: the pill names the player (wireframe 6), so the phone
  // shows whose turn it is after it changes hands.
  const seat = (name: string): Seat => ({
    name,
    label: name,
    turnLabel: t('game.strip.turnOf', { name }),
    you: false,
  });
  return {
    white: seat(setup.names.white || t('game.players.white')),
    black: seat(setup.names.black || t('game.players.black')),
  };
}
