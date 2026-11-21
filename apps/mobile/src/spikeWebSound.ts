// SPIKE (#640): a SoundPlayer for the browser on the Web Audio API.
// Safari blocks its main thread (300 to 700 ms) each time an <audio> element
// starts while no other sound plays: it activates the audio session with a
// sync call. One AudioContext that stays open pays that once.
import type { SoundBank, SoundPlayer, SoundSource } from '@tavli/contracts';
import { Asset } from 'expo-asset';

interface Sound {
  readonly takes: SoundSource[];
  next: number;
}

export function createWebSoundPlayer(): SoundPlayer {
  let ctx: AudioContext | null = null;
  const buffers = new Map<SoundSource, AudioBuffer>();
  let sounds = new Map<string, Sound>();

  const context = (): AudioContext | null => {
    if (ctx) return ctx;
    try {
      ctx = new AudioContext({ latencyHint: 'interactive' });
    } catch {
      ctx = null;
    }
    return ctx;
  };

  // A browser starts the context only after a tap or a key.
  const wake = () => {
    const c = context();
    if (c && c.state !== 'running') c.resume().catch(() => undefined);
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', wake, { capture: true, passive: true });
    document.addEventListener('keydown', wake, { capture: true, passive: true });
  }

  const fetchBuffer = async (source: SoundSource) => {
    const c = context();
    if (!c || buffers.has(source)) return;
    try {
      const uri = typeof source === 'string' ? source : Asset.fromModule(source).uri;
      const data = await (await fetch(uri)).arrayBuffer();
      buffers.set(source, await c.decodeAudioData(data));
    } catch {
      // This sound stays silent.
    }
  };

  return {
    load: (bank: SoundBank) => {
      const next = new Map<string, Sound>();
      for (const [name, sources] of Object.entries(bank)) {
        next.set(name, { takes: [...sources], next: 0 });
        for (const s of sources) void fetchBuffer(s);
      }
      sounds = next;
    },
    play: (name) => {
      const sound = sounds.get(name);
      const c = ctx;
      if (!sound || !c || c.state !== 'running' || sound.takes.length === 0) return;
      const take = sound.takes[sound.next % sound.takes.length];
      sound.next += 1;
      const buffer = take === undefined ? undefined : buffers.get(take);
      if (!buffer) return;
      try {
        const node = c.createBufferSource();
        node.buffer = buffer;
        node.connect(c.destination);
        node.start();
      } catch {
        // No audio.
      }
    },
    unload: () => {
      sounds = new Map();
    },
  };
}

/** `?fx=oldsound` keeps the <audio> player, `?fx=nosound` plays nothing. */
export function spikeSoundMode(): 'web' | 'old' | 'none' {
  let fx = '';
  try {
    fx = sessionStorage.getItem('spike.fx') ?? '';
  } catch {
    // No storage.
  }
  const set = new Set(fx.split('.'));
  return set.has('nosound') ? 'none' : set.has('oldsound') ? 'old' : 'web';
}
