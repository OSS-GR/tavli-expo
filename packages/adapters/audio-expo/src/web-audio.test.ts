import { beforeEach, describe, expect, it } from 'vitest';

import {
  createWebAudioSoundPlayer,
  type WebAudioContext,
  type WebAudioDeps,
  type WebAudioSource,
} from './web-audio';

/** A fake `AudioContext` that records what the player does. */
function fakeAudio(start: 'suspended' | 'running' = 'suspended') {
  const log: string[] = [];
  /** Which file each fake byte buffer stands for. */
  const names = new Map<ArrayBuffer, string>();
  const nodes: WebAudioSource[] = [];
  const gain = { gain: { value: 1 }, connect: () => undefined };
  let state: string = start;
  let contexts = 0;
  let failDecode: string | null = null;
  const context: WebAudioContext = {
    get state() {
      return state;
    },
    destination: 'speakers',
    resume: () => {
      log.push('resume');
      state = 'running';
      return Promise.resolve();
    },
    decodeAudioData: (data) => {
      const name = names.get(data) ?? '?';
      if (name === failDecode) return Promise.reject(new Error('bad file'));
      log.push(`decode:${name}`);
      return Promise.resolve(`buffer:${name}`);
    },
    createBufferSource: () => {
      const node: WebAudioSource = {
        buffer: null,
        onended: null,
        connect: (to) => {
          log.push(to === gain ? 'connect:gain' : 'connect:other');
          return to;
        },
        start: () => log.push(`start:${String(node.buffer)}`),
        stop: () => log.push(`stop:${String(node.buffer)}`),
      };
      nodes.push(node);
      return node;
    },
    createGain: () => gain,
  };
  const deps: WebAudioDeps = {
    createContext: () => {
      contexts += 1;
      return context;
    },
    fetchBytes: (uri) => {
      log.push(`fetch:${uri}`);
      const bytes = new ArrayBuffer(1);
      names.set(bytes, uri);
      return Promise.resolve(bytes);
    },
    uriOf: (source) => (typeof source === 'string' ? source : `/asset/${source}`),
  };
  return {
    log,
    nodes,
    gain,
    deps,
    contexts: () => contexts,
    suspend: () => {
      state = 'suspended';
    },
    failDecodeOf: (uri: string) => {
      failDecode = uri;
    },
  };
}

/** Lets the fetch and decode promises finish. */
const settle = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

describe('createWebAudioSoundPlayer', () => {
  let audio: ReturnType<typeof fakeAudio>;
  beforeEach(() => {
    audio = fakeAudio();
  });

  it('makes one context and decodes every take once', async () => {
    const player = createWebAudioSoundPlayer(audio.deps);
    player.load({ checkerPlace: [1, 2], checkerHit: [3], bearOff: [3] });
    await settle();
    expect(audio.contexts()).toBe(1);
    expect(audio.log.filter((l) => l.startsWith('fetch:'))).toEqual([
      'fetch:/asset/1',
      'fetch:/asset/2',
      'fetch:/asset/3',
    ]);
    expect(audio.log.filter((l) => l.startsWith('decode:'))).toHaveLength(3);
    player.load({ checkerPlace: [1, 2] });
    await settle();
    expect(audio.contexts()).toBe(1);
    expect(audio.log.filter((l) => l.startsWith('fetch:'))).toHaveLength(3);
  });

  it('is silent until a tap wakes the context, then plays through the gain', async () => {
    const player = createWebAudioSoundPlayer(audio.deps, { volume: 0.4 });
    player.load({ diceRoll: ['/dice.m4a'] });
    await settle();
    player.play('diceRoll');
    expect(audio.nodes).toHaveLength(0);
    player.wake();
    expect(audio.log).toContain('resume');
    player.play('diceRoll');
    expect(audio.gain.gain.value).toBe(0.4);
    expect(audio.log.slice(-2)).toEqual(['connect:gain', 'start:buffer:/dice.m4a']);
  });

  it('does not resume a context that already runs', () => {
    audio = fakeAudio('running');
    const player = createWebAudioSoundPlayer(audio.deps);
    player.wake();
    player.wake();
    expect(audio.log).not.toContain('resume');
  });

  it('plays the takes in turn, and two plays overlap', async () => {
    audio = fakeAudio('running');
    const player = createWebAudioSoundPlayer(audio.deps);
    player.load({ checkerPlace: ['a', 'b', 'c'] });
    await settle();
    for (let i = 0; i < 4; i += 1) player.play('checkerPlace');
    expect(audio.log.filter((l) => l.startsWith('start:'))).toEqual([
      'start:buffer:a',
      'start:buffer:b',
      'start:buffer:c',
      'start:buffer:a',
    ]);
    expect(audio.nodes).toHaveLength(4);
    expect(audio.log).not.toContain('stop:buffer:a');
  });

  it('goes silent again when the browser suspends the context', async () => {
    audio = fakeAudio('running');
    const player = createWebAudioSoundPlayer(audio.deps);
    player.load({ diceRoll: ['d'] });
    await settle();
    audio.suspend();
    player.play('diceRoll');
    expect(audio.nodes).toHaveLength(0);
    player.wake();
    player.play('diceRoll');
    expect(audio.nodes).toHaveLength(1);
  });

  it('does nothing for an unknown name, an empty sound or a take still loading', async () => {
    audio = fakeAudio('running');
    const player = createWebAudioSoundPlayer(audio.deps);
    player.load({ diceRoll: ['d'], nothing: [] });
    player.play('diceRoll'); // not decoded yet
    player.play('nothing');
    player.play('missing');
    expect(audio.nodes).toHaveLength(0);
    await settle();
    player.play('diceRoll');
    expect(audio.nodes).toHaveLength(1);
  });

  it('keeps the other takes when one file is bad', async () => {
    audio = fakeAudio('running');
    audio.failDecodeOf('bad');
    const player = createWebAudioSoundPlayer(audio.deps);
    player.load({ checkerPlace: ['bad', 'good'] });
    await settle();
    player.play('checkerPlace'); // the bad take: silent
    player.play('checkerPlace');
    expect(audio.log.filter((l) => l.startsWith('start:'))).toEqual(['start:buffer:good']);
  });

  it('unload stops what plays and forgets the bank', async () => {
    audio = fakeAudio('running');
    const player = createWebAudioSoundPlayer(audio.deps);
    player.load({ diceRoll: ['d'] });
    await settle();
    player.play('diceRoll');
    player.unload();
    expect(audio.log).toContain('stop:buffer:d');
    player.play('diceRoll');
    expect(audio.nodes).toHaveLength(1);
  });

  it('drops a decode that ends after an unload', async () => {
    audio = fakeAudio('running');
    const player = createWebAudioSoundPlayer(audio.deps);
    player.load({ diceRoll: ['d'] });
    player.unload();
    await settle();
    player.load({ other: ['o'] });
    await settle();
    player.play('diceRoll');
    expect(audio.nodes).toHaveLength(0);
  });

  it('a bank loaded again while its files are on the way still gets them', async () => {
    audio = fakeAudio('running');
    const player = createWebAudioSoundPlayer(audio.deps);
    player.load({ diceRoll: ['d'] });
    player.unload();
    player.load({ diceRoll: ['d'] }); // the first fetch of `d` has not ended
    await settle();
    player.play('diceRoll');
    expect(audio.log.filter((l) => l.startsWith('start:'))).toEqual(['start:buffer:d']);
    expect(audio.log.filter((l) => l === 'fetch:d')).toHaveLength(1);
  });

  it('the same holds after another bank came between', async () => {
    audio = fakeAudio('running');
    const player = createWebAudioSoundPlayer(audio.deps);
    player.load({ diceRoll: ['d'] });
    player.load({ other: ['o'] });
    player.load({ diceRoll: ['d'] });
    await settle();
    player.play('diceRoll');
    player.play('other'); // not in the bank loaded now
    expect(audio.log.filter((l) => l.startsWith('start:'))).toEqual(['start:buffer:d']);
  });

  it('never throws where the browser has no audio', async () => {
    const none = createWebAudioSoundPlayer({ ...audio.deps, createContext: () => null });
    const broken = createWebAudioSoundPlayer({
      ...audio.deps,
      createContext: () => {
        throw new Error('blocked');
      },
    });
    for (const player of [none, broken]) {
      expect(() => {
        player.load({ diceRoll: ['d'] });
        player.wake();
        player.play('diceRoll');
        player.unload();
      }).not.toThrow();
    }
    await settle();
    expect(audio.nodes).toHaveLength(0);
  });
});
