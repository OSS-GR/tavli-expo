/**
 * A `SoundPlayer` on the Web Audio API, for browsers (#675).
 *
 * Why not expo-audio on the web: it plays each sound with an `<audio>`
 * element. Each time one starts while no other sound plays, Safari turns its
 * audio session on with a blocking call, and the page freezes for 300 to
 * 700 ms (`docs/architecture/web-app.md`, "The Safari freezes").
 *
 * This player keeps one `AudioContext` open, so Safari pays that once:
 *
 * - `load` fetches every take and decodes it into a buffer, once per source.
 * - `play` starts a buffer on the open context. Takes go in turn (round
 *   robin), and two plays can overlap.
 * - A browser lets a page make sound only after a tap or a key. `wake` (the
 *   browser file calls it on the first touch or key) starts the context. A
 *   `play` before that is silent, like a phone on mute.
 *
 * This file has no browser globals: the browser parts come in as `deps`, so
 * Vitest can run it. Nothing here throws.
 */
import type { SoundBank, SoundPlayer, SoundSource } from '@tavli/contracts';

/** The parts of `AudioContext` this player uses. */
export interface WebAudioContext {
  readonly state: string;
  readonly destination: unknown;
  resume(): Promise<void>;
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
  createBufferSource(): WebAudioSource;
  createGain(): WebAudioGain;
}

export interface WebAudioSource {
  buffer: unknown;
  onended: (() => void) | null;
  connect(to: unknown): unknown;
  start(): void;
  stop(): void;
}

export interface WebAudioGain {
  readonly gain: { value: number };
  connect(to: unknown): unknown;
}

export interface WebAudioDeps {
  /** Makes the one context. May throw or return null (no audio here). */
  createContext: () => WebAudioContext | null;
  /** The bytes of a sound file. */
  fetchBytes: (uri: string) => Promise<ArrayBuffer>;
  /** The address of a sound source (a bundled asset id or a URI). */
  uriOf: (source: SoundSource) => string;
}

export interface WebAudioOptions {
  /** Volume of every sound, 0..1. Default 1. */
  volume?: number;
}

interface Sound {
  readonly takes: readonly SoundSource[];
  next: number;
}

export interface WebAudioSoundPlayer extends SoundPlayer {
  /** Starts the context. Call it from a tap or a key handler. */
  wake(): void;
}

export function createWebAudioSoundPlayer(
  deps: WebAudioDeps,
  options: WebAudioOptions = {},
): WebAudioSoundPlayer {
  const volume = Math.min(1, Math.max(0, options.volume ?? 1));
  let context: WebAudioContext | null | undefined;
  let output: unknown = null;
  /** One decoded buffer per source, shared by every sound that uses it. */
  let buffers = new Map<SoundSource, unknown>();
  /** Sources being fetched now, so two loads do not fetch one file twice. */
  const loading = new Set<SoundSource>();
  let sounds = new Map<string, Sound>();
  const playing = new Set<WebAudioSource>();
  /** Goes up at each `load` and `unload`: a late decode of an old bank is dropped. */
  let generation = 0;

  const ready = (): WebAudioContext | null => {
    if (context !== undefined) return context;
    try {
      context = deps.createContext();
      if (context) {
        const gain = context.createGain();
        gain.gain.value = volume;
        gain.connect(context.destination);
        output = gain;
      }
    } catch {
      context = null;
    }
    return context;
  };

  const fetchInto = (source: SoundSource, ctx: WebAudioContext) => {
    if (buffers.has(source) || loading.has(source)) return;
    loading.add(source);
    const mine = generation;
    Promise.resolve()
      .then(() => deps.fetchBytes(deps.uriOf(source)))
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buffer) => {
        if (mine === generation) buffers.set(source, buffer);
      })
      .catch(() => undefined) // This take stays silent.
      .finally(() => loading.delete(source));
  };

  const stopAll = () => {
    for (const node of playing) {
      try {
        node.stop();
      } catch {
        // It ended already.
      }
    }
    playing.clear();
  };

  return {
    load: (bank: SoundBank) => {
      const ctx = ready();
      const next = new Map<string, Sound>();
      const wanted = new Set<SoundSource>();
      for (const [name, sources] of Object.entries(bank)) {
        if (sources.length === 0) continue;
        next.set(name, { takes: sources, next: 0 });
        for (const source of sources) wanted.add(source);
      }
      // Keep the buffers this bank still uses; free the rest.
      generation += 1;
      buffers = new Map([...buffers].filter(([source]) => wanted.has(source)));
      sounds = next;
      if (ctx) for (const source of wanted) fetchInto(source, ctx);
    },

    play: (name) => {
      const sound = sounds.get(name);
      const ctx = context;
      if (!sound || !ctx || ctx.state !== 'running') return;
      const take = sound.takes[sound.next % sound.takes.length];
      sound.next += 1;
      const buffer = take === undefined ? undefined : buffers.get(take);
      if (buffer === undefined) return;
      try {
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        node.connect(output);
        node.onended = () => playing.delete(node);
        playing.add(node);
        node.start();
      } catch {
        // No audio here.
      }
    },

    unload: () => {
      generation += 1;
      stopAll();
      buffers = new Map();
      sounds = new Map();
    },

    wake: () => {
      const ctx = ready();
      if (!ctx || ctx.state === 'running') return;
      try {
        ctx.resume().catch(() => undefined);
      } catch {
        // No audio here.
      }
    },
  };
}
