import { gatedSoundPlayer } from '@tavli/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// expo-audio ships React Native code, which Node cannot load. Replace it
// with fakes that record the calls.
const log: string[] = [];
const modes: unknown[] = [];
let failCreate = false;

class FakePlayer {
  volume = 1;
  constructor(readonly source: unknown) {
    log.push(`create:${String(source)}`);
  }
  seekTo(seconds: number) {
    log.push(`seek:${String(this.source)}:${seconds}`);
    return Promise.resolve();
  }
  play() {
    log.push(`play:${String(this.source)}`);
    if (this.source === 'broken') throw new Error('no audio');
  }
  remove() {
    log.push(`remove:${String(this.source)}`);
  }
}

vi.mock('expo-audio', () => ({
  createAudioPlayer: (source: unknown) => {
    if (failCreate) throw new Error('no audio');
    return new FakePlayer(source);
  },
  setAudioModeAsync: (mode: unknown) => {
    modes.push(mode);
    return Promise.reject(new Error('no session'));
  },
}));

const { createExpoSoundPlayer } = await import('./index');

describe('createExpoSoundPlayer', () => {
  beforeEach(() => {
    log.length = 0;
    modes.length = 0;
    failCreate = false;
  });

  it('preloads every take once and sets a mixing, silent-switch audio mode', () => {
    const player = createExpoSoundPlayer({ volume: 0.5 });
    player.load({ checkerPlace: [1, 2, 3], checkerHit: [4], bearOff: [4] });
    expect(log).toEqual(['create:1', 'create:2', 'create:3', 'create:4']);
    expect(modes).toEqual([
      {
        playsInSilentMode: false,
        interruptionMode: 'mixWithOthers',
        shouldPlayInBackground: false,
        allowsRecording: false,
      },
    ]);
  });

  it('plays the takes of a sound in turn, from the start', () => {
    const player = createExpoSoundPlayer();
    player.load({ checkerPlace: [1, 2] });
    log.length = 0;
    player.play('checkerPlace');
    player.play('checkerPlace');
    player.play('checkerPlace');
    expect(log).toEqual(['seek:1:0', 'play:1', 'seek:2:0', 'play:2', 'seek:1:0', 'play:1']);
  });

  it('does nothing for a sound it has no takes for', () => {
    const player = createExpoSoundPlayer();
    player.load({ checkerPlace: [1], turnStart: [] });
    log.length = 0;
    player.play('turnStart');
    player.play('gameWin');
    expect(log).toEqual([]);
  });

  it('keeps players it can reuse and frees the rest on a new load', () => {
    const player = createExpoSoundPlayer();
    player.load({ a: [1, 2] });
    log.length = 0;
    player.load({ a: [2, 3] });
    expect(log).toEqual(['create:3', 'remove:1']);
    log.length = 0;
    player.unload();
    expect(log.sort()).toEqual(['remove:2', 'remove:3']);
    player.play('a');
    expect(log).toHaveLength(2);
  });

  it('never throws when the phone cannot play audio', async () => {
    const player = createExpoSoundPlayer();
    player.load({ bad: ['broken'] });
    expect(() => player.play('bad')).not.toThrow();
    failCreate = true;
    expect(() => player.load({ x: ['other'] })).not.toThrow();
    expect(() => player.play('x')).not.toThrow();
    // Let the rejected audio-mode promise settle: it must not surface.
    await Promise.resolve();
    await Promise.resolve();
  });

  it('stays silent while the Sound setting is off', () => {
    let soundOn = false;
    const player = gatedSoundPlayer(createExpoSoundPlayer(), () => soundOn);
    player.load({ diceRoll: [9] });
    log.length = 0;
    player.play('diceRoll');
    expect(log).toEqual([]);
    soundOn = true;
    player.play('diceRoll');
    expect(log).toEqual(['seek:9:0', 'play:9']);
  });
});
