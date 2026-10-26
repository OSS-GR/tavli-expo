/**
 * The one place where the app picks its adapters (ADR-0002).
 * Everything else imports ports from `@tavli/contracts` and gets the
 * real implementation from here.
 *
 * Jest replaces this module with in-memory fakes (`jest.setup.ts`).
 */
import { createExpoSoundPlayer } from '@tavli/audio-expo';
import type { Feedback, SoundPlayer, Storage } from '@tavli/contracts';
import { createSeededRng, type Rng } from '@tavli/engine';
import { createExpoFeedback } from '@tavli/haptics-expo';
import { createMmkvStorage } from '@tavli/storage-mmkv';

export const storage: Storage = createMmkvStorage({ id: 'tavlaki' });

/** Haptics. Use `appFeedback` (features/feedback), which follows the Haptics setting. */
export const feedback: Feedback = createExpoFeedback();

/** Sound effects. Use `appSound` (features/feedback), which follows the Sound setting. */
export const sound: SoundPlayer = createExpoSoundPlayer();

/** A fresh 32-bit seed: from `crypto` when the runtime has it, else from the clock. */
function randomSeed(): number {
  const values = new Uint32Array(1);
  const crypto = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => void } }).crypto;
  if (crypto?.getRandomValues) {
    crypto.getRandomValues(values);
    return values[0] ?? Date.now() >>> 0;
  }
  return (Date.now() ^ (performance.now() * 1000)) >>> 0;
}

/**
 * Dice for local games (vs bot, pass-and-play). Not secure: online games
 * get their dice from the server.
 */
export function createLocalRng(): Rng {
  return createSeededRng(randomSeed());
}
