/**
 * `SoundPlayer` adapter backed by expo-audio.
 *
 * - `load` creates one native player per take. Creating the player loads
 *   the file, so the first `play` starts at once. A take that was already
 *   loaded keeps its player; takes that are gone are freed.
 * - `play` rewinds the next take of a sound and plays it. Takes go in turn
 *   (round robin), so a quick second click does not cut the first one off.
 * - The audio session mixes with other apps (music keeps playing) and
 *   follows the phone's silent switch, as `docs/design/art-pipeline.md` §5 asks.
 *
 * Nothing here throws: a phone that cannot play a sound stays silent.
 */
import type { SoundBank, SoundPlayer, SoundSource } from '@tavli/contracts';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

export interface ExpoSoundPlayerOptions {
  /** Volume of every sound, 0..1. Default 1. */
  volume?: number;
  /** Play even when the phone is in silent mode. Default `false`. */
  playsInSilentMode?: boolean;
}

interface Sound {
  readonly takes: AudioPlayer[];
  next: number;
}

function quietly(fn: () => unknown): void {
  try {
    const result = fn();
    if (result instanceof Promise) result.catch(() => undefined);
  } catch {
    // No audio on this device.
  }
}

export function createExpoSoundPlayer(options: ExpoSoundPlayerOptions = {}): SoundPlayer {
  const volume = Math.min(1, Math.max(0, options.volume ?? 1));
  /** One native player per source, shared by every sound that uses it. */
  let players = new Map<SoundSource, AudioPlayer>();
  let sounds = new Map<string, Sound>();
  let sessionReady = false;

  const prepareSession = () => {
    if (sessionReady) return;
    sessionReady = true;
    quietly(() =>
      setAudioModeAsync({
        playsInSilentMode: options.playsInSilentMode ?? false,
        interruptionMode: 'mixWithOthers',
        shouldPlayInBackground: false,
        allowsRecording: false,
      }),
    );
  };

  const playerFor = (source: SoundSource, fresh: Map<SoundSource, AudioPlayer>) => {
    const known = fresh.get(source) ?? players.get(source);
    if (known) {
      fresh.set(source, known);
      return known;
    }
    try {
      const player = createAudioPlayer(source);
      player.volume = volume;
      fresh.set(source, player);
      return player;
    } catch {
      return null;
    }
  };

  const release = (list: Iterable<AudioPlayer>) => {
    for (const player of list) quietly(() => player.remove());
  };

  return {
    load: (bank: SoundBank) => {
      prepareSession();
      const fresh = new Map<SoundSource, AudioPlayer>();
      const next = new Map<string, Sound>();
      for (const [name, sources] of Object.entries(bank)) {
        const takes = sources
          .map((s) => playerFor(s, fresh))
          .filter((p): p is AudioPlayer => p !== null);
        if (takes.length > 0) next.set(name, { takes, next: 0 });
      }
      release([...players].filter(([s]) => !fresh.has(s)).map(([, p]) => p));
      players = fresh;
      sounds = next;
    },

    play: (name) => {
      const sound = sounds.get(name);
      if (!sound) return;
      const player = sound.takes[sound.next % sound.takes.length];
      sound.next += 1;
      if (!player) return;
      quietly(() => player.seekTo(0));
      quietly(() => player.play());
    },

    unload: () => {
      release(players.values());
      players = new Map();
      sounds = new Map();
    },
  };
}
