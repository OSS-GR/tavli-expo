import { describe, expect, it } from 'vitest';

import { createNoopSoundPlayer, createRecordingSoundPlayer, gatedSoundPlayer } from './sound';

describe('sound player', () => {
  it('records loads and plays', () => {
    const player = createRecordingSoundPlayer();
    player.load({ checkerPlace: [1, 2] });
    player.play('checkerPlace');
    player.play('gameWin');
    expect(player.loaded).toEqual([{ checkerPlace: [1, 2] }]);
    expect(player.played).toEqual(['checkerPlace', 'gameWin']);
  });

  it('does nothing in the no-op version', () => {
    const player = createNoopSoundPlayer();
    expect(() => {
      player.load({ a: ['x.m4a'] });
      player.play('a');
      player.unload();
    }).not.toThrow();
  });

  it('plays only while the Sound setting is on, but always loads', () => {
    const base = createRecordingSoundPlayer();
    let on = false;
    const gated = gatedSoundPlayer(base, () => on);
    gated.load({ diceRoll: [7] });
    gated.play('diceRoll');
    on = true;
    gated.play('diceLand');
    expect(base.loaded).toHaveLength(1);
    expect(base.played).toEqual(['diceLand']);
  });
});
