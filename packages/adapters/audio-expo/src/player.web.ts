/**
 * The browser twin of `player.ts` (#675): the same `createExpoSoundPlayer`,
 * on the Web Audio API. See `web-audio.ts` for why.
 */
import type { SoundPlayer } from '@tavli/contracts';
import { Asset } from 'expo-asset';

import { createWebAudioSoundPlayer, type WebAudioContext } from './web-audio';

export interface ExpoSoundPlayerOptions {
  /** Volume of every sound, 0..1. Default 1. */
  volume?: number;
  /** A phone setting: a browser has no silent switch. */
  playsInSilentMode?: boolean;
}

type ContextClass = new (options?: { latencyHint?: string }) => WebAudioContext;

export function createExpoSoundPlayer(options: ExpoSoundPlayerOptions = {}): SoundPlayer {
  const scope = globalThis as {
    AudioContext?: ContextClass;
    webkitAudioContext?: ContextClass;
    document?: {
      addEventListener(
        type: string,
        listener: () => void,
        options: { capture: boolean; passive: boolean },
      ): void;
    };
  };
  const player = createWebAudioSoundPlayer(
    {
      createContext: () => {
        const Context = scope.AudioContext ?? scope.webkitAudioContext;
        return Context ? new Context({ latencyHint: 'interactive' }) : null;
      },
      fetchBytes: async (uri) => (await fetch(uri)).arrayBuffer(),
      uriOf: (source) => (typeof source === 'string' ? source : Asset.fromModule(source).uri),
    },
    options.volume === undefined ? {} : { volume: options.volume },
  );
  // A browser starts audio only from a tap or a key. The listeners stay: a
  // browser can suspend the context again (a phone call, a hidden tab).
  const doc = scope.document;
  if (doc) {
    const wake = () => player.wake();
    doc.addEventListener('pointerdown', wake, { capture: true, passive: true });
    doc.addEventListener('keydown', wake, { capture: true, passive: true });
  }
  return player;
}
