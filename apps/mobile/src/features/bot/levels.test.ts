import { BotError, createBot, type Bot } from '@tavli/bot';
import type { Difficulty } from '@tavli/contracts';
import type { VariantId } from '@tavli/engine';

import { gameLevels } from '@/features/match/setup';

import { anyGameLevels, botLevelsByGame, supportedBotLevels, type LevelBot } from './levels';

/** A bot with no `supportedLevels`: it plays `levels` in `variants`, else throws NOT_IMPLEMENTED. */
function probedBot(variants: readonly VariantId[], levels: readonly Difficulty[]): LevelBot {
  return {
    chooseTurn: (state, dice, level) => {
      if (!variants.includes(state.variant) || !levels.includes(level as Difficulty)) {
        throw new BotError('NOT_IMPLEMENTED', `no ${level} bot for ${state.variant}`);
      }
      return { player: state.toMove, dice, moves: [] };
    },
  };
}

/** A bot that lists its levels per variant, like `createBot`. */
function listingBot(levels: Partial<Record<VariantId, readonly Difficulty[]>>): LevelBot {
  return {
    chooseTurn: () => {
      throw new Error('a listing bot is never probed');
    },
    supportedLevels: (variant) => levels[variant] ?? [],
  };
}

describe('supportedBotLevels', () => {
  it('finds easy and medium for each built game today, and hard for Portes, Plakoto and Fevga', () => {
    const bot = createBot();
    expect(supportedBotLevels(bot)).toEqual(['easy', 'medium', 'hard']);
    expect(supportedBotLevels(bot, 'plakoto')).toEqual(['easy', 'medium', 'hard']);
    expect(supportedBotLevels(bot, 'fevga')).toEqual(['easy', 'medium', 'hard']);
    expect(supportedBotLevels(bot, 'asodio')).toEqual(['easy', 'medium']);
  });

  it('probes Asodio like any other built game', () => {
    expect(supportedBotLevels(probedBot(['asodio'], ['easy']), 'asodio')).toEqual(['easy']);
  });

  it('asks the bot for its levels when it can list them (easiest first)', () => {
    const bot = listingBot({ fevga: ['hard', 'easy'] });
    expect(supportedBotLevels(bot, 'fevga')).toEqual(['easy', 'hard']);
    expect(supportedBotLevels(bot, 'portes')).toEqual([]);
  });

  it('else probes each level with the start of that game', () => {
    const bot = probedBot(['portes', 'fevga'], ['easy', 'medium', 'hard']);
    expect(supportedBotLevels(bot)).toEqual(['easy', 'medium', 'hard']);
    expect(supportedBotLevels(bot, 'fevga')).toEqual(['easy', 'medium', 'hard']);
    expect(supportedBotLevels(bot, 'plakoto')).toEqual([]);
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

describe('botLevelsByGame', () => {
  it('opens every built game in the bot package today (Hard for all but Asodio)', () => {
    // Tavli needs a level in Portes, Plakoto and Fevga: all three have Hard now (#156).
    expect(botLevelsByGame(createBot())).toEqual({
      portes: ['easy', 'medium', 'hard'],
      plakoto: ['easy', 'medium', 'hard'],
      fevga: ['easy', 'medium', 'hard'],
      tavli: ['easy', 'medium', 'hard'],
      asodio: ['easy', 'medium'],
    });
  });

  it('locks a game the bot cannot play, and Tavli with it', () => {
    const levels = botLevelsByGame(probedBot(['portes', 'fevga'], ['easy']));
    expect(levels.portes).toEqual(['easy']);
    expect(levels.fevga).toEqual(['easy']);
    expect(levels.plakoto).toEqual([]);
    expect(levels.tavli).toEqual([]);
  });

  it('gives Tavli the levels that work in all three games', () => {
    const levels = botLevelsByGame(
      listingBot({
        portes: ['easy', 'medium', 'hard'],
        plakoto: ['easy', 'medium'],
        fevga: ['easy', 'hard'],
      }),
    );
    expect(levels.tavli).toEqual(['easy']);
    expect(levels.portes).toEqual(['easy', 'medium', 'hard']);
  });
});

describe('anyGameLevels', () => {
  it('lists each level that works in at least one game, easiest first', () => {
    expect(anyGameLevels(gameLevels(['easy'], { fevga: ['hard', 'easy'] }))).toEqual([
      'easy',
      'hard',
    ]);
    expect(anyGameLevels(gameLevels([]))).toEqual([]);
  });

  it('has Easy, Medium and Hard with the real bot', () => {
    expect(anyGameLevels(botLevelsByGame(createBot()))).toEqual(['easy', 'medium', 'hard']);
  });
});
