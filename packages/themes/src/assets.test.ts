import { describe, expect, it } from 'vitest';

import { allSoundFiles, soundFiles } from './assets';

describe('sound files', () => {
  const theme = {
    sounds: {
      checkerPlace: ['sounds/place-1.m4a', 'sounds/place-2.m4a'],
      checkerHit: 'sounds/hit.m4a',
      bearOff: 'sounds/hit.m4a',
      turnStart: null,
    },
  };

  it('lists the takes of one sound', () => {
    expect(soundFiles(theme, 'checkerPlace')).toEqual(['sounds/place-1.m4a', 'sounds/place-2.m4a']);
    expect(soundFiles(theme, 'checkerHit')).toEqual(['sounds/hit.m4a']);
  });

  it('gives no files for a silent or missing sound', () => {
    expect(soundFiles(theme, 'turnStart')).toEqual([]);
    expect(soundFiles(theme, 'gameWin')).toEqual([]);
  });

  it('lists every file of a theme once', () => {
    expect(allSoundFiles(theme)).toEqual([
      'sounds/place-1.m4a',
      'sounds/place-2.m4a',
      'sounds/hit.m4a',
    ]);
  });
});
