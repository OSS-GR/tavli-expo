import { describe, expect, it } from 'vitest';

import { CHECKERS_PER_PLAYER, POINTS_ON_BOARD } from './index';

describe('engine constants', () => {
  it('uses a standard tavli board', () => {
    expect(CHECKERS_PER_PLAYER).toBe(15);
    expect(POINTS_ON_BOARD).toBe(24);
  });
});
