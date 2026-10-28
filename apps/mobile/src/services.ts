/**
 * The one place where the app picks its adapters (ADR-0002).
 * Everything else imports ports from `@tavli/contracts` and gets the
 * real implementation from here.
 *
 * Jest replaces this module with in-memory fakes (`jest.setup.ts`).
 */
import { createPostHogAnalytics } from '@tavli/analytics-posthog';
import { createExpoSoundPlayer } from '@tavli/audio-expo';
import { InlineBotRunner, createAnalyzer, createBot, type Analyzer } from '@tavli/bot';
import {
  createNoopAnalytics,
  createNoopCrashReporter,
  type Analytics,
  type BotRunner,
  type CrashReporter,
  type Feedback,
  type GameTransport,
  type SoundPlayer,
  type Storage,
} from '@tavli/contracts';
import { createSentryCrashReporter } from '@tavli/crash-sentry';
import { createSeededRng, type Rng } from '@tavli/engine';
import { createExpoFeedback } from '@tavli/haptics-expo';
import { createMemoryGameServer, type MemoryGameServer } from '@tavli/online';
import { createMmkvStorage } from '@tavli/storage-mmkv';
import Constants from 'expo-constants';

import { botLevelsByGame } from '@/features/bot/levels';
import type { GameLevels } from '@/features/match/setup';

export const storage: Storage = createMmkvStorage({ id: 'tavlaki' });

/**
 * Crash reports. Sentry in release builds that have `EXPO_PUBLIC_SENTRY_DSN`;
 * a no-op in dev and in builds without a DSN. Started in
 * `features/crash/start.ts`, which also follows the consent store (`features/privacy`).
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
 * after the user says yes (`features/analytics/store.ts`).
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

const bot = createBot();

/** The bot port (ADR-0006). MVP1 runs the bot on the JS thread. */
export const botRunner: BotRunner = new InlineBotRunner(bot);

/**
 * The bot levels this build can play, per game (#109). A level or a game
 * shows up as soon as the bot package has an evaluator for it.
 */
export const botLevels: GameLevels = botLevelsByGame(bot);

/**
 * The Hint button (#209): the bot's Analyzer ranks the turns for a roll. It
 * uses the same evaluators as the bot (the variant's best one).
 */
export const analyzer: Analyzer = createAnalyzer();

/**
 * Online games (#255). Online play waits for sign-in (#131), so for now
 * every online game runs on one in-memory server for this app run
 * (`@tavli/online`, no network), and this phone plays as `onlinePlayerId`.
 * The dev route `app/dev/online.tsx` starts games on it vs the bot. When
 * the build has a Convex URL (`convexUrl()` in `convexUrl.ts`, set by
 * `EXPO_PUBLIC_CONVEX_URL` or the app variant), the Convex adapter (#253)
 * replaces this server here, and the player id comes from sign-in.
 *
 * The in-memory server runs no timers: whoever starts a game on it runs
 * `runDueTimeouts()` (the dev game does, `features/online/devGame.ts`). Its
 * dice come from `createLocalRng`, which is fine for a dev server only.
 * It is built on first use, so a build that never opens an online game
 * never makes it.
 */
let memoryServer: MemoryGameServer | null = null;
export function onlineServer(): MemoryGameServer {
  memoryServer ??= createMemoryGameServer({ rng: createLocalRng(), now: () => Date.now() });
  return memoryServer;
}

/** The player id of this phone in online games, until sign-in (#131). */
export const onlinePlayerId = 'me';

const transports = new Map<string, GameTransport>();

/** The online game port for `playerId`. One transport per player for the app run. */
export function gameTransportFor(playerId: string): GameTransport {
  let transport = transports.get(playerId);
  if (transport === undefined) {
    transport = onlineServer().transportFor(playerId);
    transports.set(playerId, transport);
  }
  return transport;
}
