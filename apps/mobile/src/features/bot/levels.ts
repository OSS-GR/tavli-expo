/**
 * Which bot levels work in this build, per game (#109).
 *
 * A bot from `createBot` says it itself (`supportedLevels(variant)`). For
 * another bot we ask it once per variant with that variant's start: a level
 * with no evaluator throws `BotError('NOT_IMPLEMENTED')`. So a new bot
 * variant (Fevga, Plakoto) shows up here as soon as the bot package has it.
 */
import { BotError, type Bot } from '@tavli/bot';
import { BOT_DIFFICULTIES, type Difficulty } from '@tavli/contracts';
import {
  VARIANT_REGISTRY,
  createSeededRng,
  getVariant,
  type Dice,
  type StandardVariantId,
  type VariantId,
} from '@tavli/engine';

import { BOARD_GAMES, GAME_CHOICES, gameRotation, type GameLevels } from '@/features/match/setup';

/** A bot that may also list its levels (`ConfiguredBot` does). */
export type LevelBot = Pick<Bot, 'chooseTurn'> & {
  readonly supportedLevels?: (variant: VariantId) => readonly Difficulty[];
};

/**
 * The levels `bot` can play in `variant`, easiest first. A variant the
 * engine or the board does not have yet (`BOARD_GAMES`) gives `[]`. Other
 * bot errors are bugs and throw.
 */
export function supportedBotLevels(
  bot: LevelBot,
  variant: StandardVariantId = 'portes',
): Difficulty[] {
  if (!VARIANT_REGISTRY.has(variant) || !BOARD_GAMES.has(variant)) return [];
  if (typeof bot.supportedLevels === 'function') {
    const levels = bot.supportedLevels(variant);
    return BOT_DIFFICULTIES.filter((level) => levels.includes(level));
  }
  const dice: Dice = [3, 1];
  const start = getVariant(VARIANT_REGISTRY, variant).initialState({ startingPlayer: 'white' });
  const state = { ...start, dice };
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

/**
 * The levels per game. A match uses one level for all its games, so Tavli
 * gets the levels that work in Portes, Plakoto and Fevga alike.
 */
export function botLevelsByGame(bot: LevelBot): GameLevels {
  const byVariant = new Map<StandardVariantId, readonly Difficulty[]>();
  const levelsOf = (variant: StandardVariantId) => {
    let levels = byVariant.get(variant);
    if (levels === undefined) {
      levels = supportedBotLevels(bot, variant);
      byVariant.set(variant, levels);
    }
    return levels;
  };
  const entries = GAME_CHOICES.map((game) => {
    const rotation = gameRotation(game);
    const levels = BOT_DIFFICULTIES.filter((level) =>
      rotation.every((variant) => levelsOf(variant).includes(level)),
    );
    return [game, levels] as const;
  });
  return Object.fromEntries(entries) as unknown as GameLevels;
}
