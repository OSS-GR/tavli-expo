/**
 * The one place where the app picks its adapters (ADR-0002).
 * Everything else imports ports from `@tavli/contracts` and gets the
 * real implementation from here.
 *
 * Jest replaces this module with in-memory fakes (`jest.setup.ts`).
 */
import { createPostHogAnalytics } from '@tavli/analytics-posthog';
import {
  createNoopAnalytics,
  createNoopCrashReporter,
  type Analytics,
  type CrashReporter,
  type Feedback,
  type Storage,
} from '@tavli/contracts';
import { createSentryCrashReporter } from '@tavli/crash-sentry';
import { createSeededRng, type Rng } from '@tavli/engine';
import { createExpoFeedback } from '@tavli/haptics-expo';
import { createMmkvStorage } from '@tavli/storage-mmkv';
import Constants from 'expo-constants';

export const storage: Storage = createMmkvStorage({ id: 'tavlaki' });

/**
 * Crash reports. Sentry in release builds that have `EXPO_PUBLIC_SENTRY_DSN`;
 * a no-op in dev and in builds without a DSN. Started in
 * `features/crash/start.ts`, which also follows the privacy setting.
 */
export const crashReporter: CrashReporter =
  __DEV__ || !process.env.EXPO_PUBLIC_SENTRY_DSN
    ? createNoopCrashReporter()
    : createSentryCrashReporter();

/** Haptics. Use `appFeedback` (features/feedback), which follows the Haptics setting. */
export const feedback: Feedback = createExpoFeedback();

/**
 * Usage analytics (#61): PostHog EU when `EXPO_PUBLIC_POSTHOG_KEY` is set,
 * else a no-op. It starts opted out; `features/analytics` turns it on only
 * after the user says yes. Use `features/analytics/store.ts`, not this.
 */
export const analytics: Analytics = createAnalytics();

function createAnalytics(): Analytics {
  // A public project key. Expo inlines EXPO_PUBLIC_* values at build time.
  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY?.trim();
  if (!apiKey) {
    if (__DEV__) {
      console.info('[analytics] EXPO_PUBLIC_POSTHOG_KEY is not set: analytics is off (no-op).');
    }
    return createNoopAnalytics();
  }
  return createPostHogAnalytics({
    apiKey,
    // PostHog's queue and IDs, in their own MMKV file.
    storage: createMmkvStorage({ id: 'posthog' }),
    ...(Constants.expoConfig?.version ? { appVersion: Constants.expoConfig.version } : {}),
  });
}

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
