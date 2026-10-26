import { describe, expect, it } from 'vitest';

import { BOT_LEVELS } from './index';

describe('bot levels', () => {
  it('lists easy, medium and hard', () => {
    expect(BOT_LEVELS).toEqual(['easy', 'medium', 'hard']);
  });
});
