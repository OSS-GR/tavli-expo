import { describe, expect, it } from 'vitest';

import { GAME_IDS } from './index';

describe('game ids', () => {
  it('lists the four Greek games', () => {
    expect(GAME_IDS).toEqual(['portes', 'plakoto', 'fevga', 'asodio']);
  });
});
