import { describe, expect, it } from 'vitest';

import { BOT_DIFFICULTIES, BotCancelledError, isBotCancelled, isDifficulty } from './index';

describe('bot runner port', () => {
  it('lists easy, medium and hard', () => {
    expect(BOT_DIFFICULTIES).toEqual(['easy', 'medium', 'hard']);
    expect(isDifficulty('medium')).toBe(true);
    expect(isDifficulty('expert')).toBe(false);
    expect(isDifficulty(1)).toBe(false);
  });

  it('marks cancelled moves', () => {
    const error = new BotCancelledError();
    expect(error).toBeInstanceOf(Error);
    expect(isBotCancelled(error)).toBe(true);
    expect(isBotCancelled(new Error('other'))).toBe(false);
    expect(isBotCancelled('BotCancelledError')).toBe(false);
  });
});
