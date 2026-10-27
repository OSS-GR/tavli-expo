/**
 * Which bot levels work in this build. The bot throws
 * `BotError('NOT_IMPLEMENTED')` for a level that has no evaluator yet
 * (today: medium and hard), so we ask it once with the Portes start.
 */
import { BotError, type Bot } from '@tavli/bot';
import { BOT_DIFFICULTIES, type Difficulty } from '@tavli/contracts';
import { createSeededRng, portes, type Dice } from '@tavli/engine';

/** The levels `bot` can play, easiest first. Other errors are bugs and throw. */
export function supportedBotLevels(bot: Pick<Bot, 'chooseTurn'>): Difficulty[] {
  const dice: Dice = [3, 1];
  const state = { ...portes.initialState({ startingPlayer: 'white' }), dice };
  return BOT_DIFFICULTIES.filter((level) => {
    try {
      bot.chooseTurn(state, dice, level, { rng: createSeededRng(1) });
      return true;
    } catch (error) {
      if (error instanceof BotError && error.code === 'NOT_IMPLEMENTED') return false;
      throw error;
    }
  });
}
