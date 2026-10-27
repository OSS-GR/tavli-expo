import { BotError, createBot, type Bot } from '@tavli/bot';

import { supportedBotLevels } from './levels';

describe('supportedBotLevels', () => {
  it('finds easy and medium in the bot package today (hard throws NOT_IMPLEMENTED)', () => {
    expect(supportedBotLevels(createBot())).toEqual(['easy', 'medium']);
  });

  it('lists every level a bot can play', () => {
    const bot: Pick<Bot, 'chooseTurn'> = {
      chooseTurn: (state, dice) => ({ player: state.toMove, dice, moves: [] }),
    };
    expect(supportedBotLevels(bot)).toEqual(['easy', 'medium', 'hard']);
  });

  it('throws other bot errors (a bug, not a missing level)', () => {
    const bot: Pick<Bot, 'chooseTurn'> = {
      chooseTurn: () => {
        throw new BotError('INVALID_REQUEST', 'bad');
      },
    };
    expect(() => supportedBotLevels(bot)).toThrow('bad');
  });
});
