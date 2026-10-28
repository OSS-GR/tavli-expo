import { describe, expect, it } from 'vitest';

import { gameOnDelete } from './account';

const players = { white: 'alice', black: 'bob' };

describe('gameOnDelete', () => {
  it('resigns an active game of the caller, on either side', () => {
    expect(gameOnDelete({ status: 'active', players }, 'alice')).toBe('resign');
    expect(gameOnDelete({ status: 'active', players }, 'bob')).toBe('resign');
  });

  it('keeps a finished game of the caller for the other player', () => {
    expect(gameOnDelete({ status: 'finished', players }, 'alice')).toBe('keep');
  });

  it('skips a game the caller does not play', () => {
    expect(gameOnDelete({ status: 'active', players }, 'carol')).toBe('skip');
    expect(gameOnDelete({ status: 'finished', players }, 'carol')).toBe('skip');
  });
});
