/**
 * The one place where the app picks its adapters (ADR-0002).
 * Everything else imports ports from `@tavli/contracts` and gets the
 * real implementation from here.
 *
 * Jest replaces this module with in-memory fakes (`jest.setup.ts`).
 */
import { createPostHogAnalytics } from '@tavli/analytics-posthog';
import { createExpoSoundPlayer } from '@tavli/audio-expo';
import {
  AppleSignInButton as ExpoAppleSignInButton,
  createExpoAppleSheet,
  type AppleSignInButtonProps,
} from '@tavli/apple-sign-in-expo';
import { createBetterAuthProvider, createSecureSessionStorage } from '@tavli/auth-better-auth';
import {
  createConvexAppUpdates,
  createConvexClient,
  createConvexFriends,
  createConvexRatings,
  createConvexGameTransport,
  createConvexInvites,
  createConvexOnlineData,
  createConvexPushTokens,
  createConvexSafety,
  createConvexUsernames,
} from '@tavli/backend-convex';
import { InlineBotRunner, createAnalyzer, createBot, type Analyzer } from '@tavli/bot';
import {
  createNoopAnalytics,
  createNoopCrashReporter,
  type Analytics,
  type AppleSheet,
  type AppUpdates,
  type AuthProvider,
  type BotRunner,
  type CrashReporter,
  type Feedback,
  type Friends,
  type Ratings,
  type GameTransport,
  type Invites,
  type OnlineData,
  type PushNotifications,
  type PushTokens,
  type Safety,
  type SoundPlayer,
  type Storage,
  type Usernames,
} from '@tavli/contracts';
import { createSentryCrashReporter } from '@tavli/crash-sentry';
import { createSeededRng, type Rng } from '@tavli/engine';
import { createExpoFeedback } from '@tavli/haptics-expo';
import { createExpoPushNotifications } from '@tavli/notifications-expo';
import { createMemoryGameServer, type MemoryGameServer } from '@tavli/online';
import { createMmkvStorage } from '@tavli/storage-mmkv';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { t } from 'i18next';
import type { ComponentType } from 'react';
import { Platform } from 'react-native';

import { APP_SCHEME, convexServer } from '@/convexUrl';
import { botLevelsByGame } from '@/features/bot/levels';
import type { GameLevels } from '@/features/match/setup';
import { readAppBuild, type AppBuild } from '@/features/update/decision';
import { createOnlineServices } from '@/onlineServices';

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

/** The EAS project id (`extra.eas.projectId`, written by `eas init`): Expo push tokens need it. */
function easProjectId(): string | undefined {
  const eas: unknown = Constants.expoConfig?.extra?.['eas'];
  if (typeof eas !== 'object' || eas === null) return undefined;
  const id: unknown = (eas as { projectId?: unknown }).projectId;
  return typeof id === 'string' && id !== '' ? id : undefined;
}

/**
 * Online play (#266, #281, #285): the Convex deployment of this build
 * (`convexUrl.ts`), with Better Auth sign-in on its site URL. All are made
 * on first use (`onlineServices.ts`): the app makes no network call and no
 * guest account at start. `undefined` when the build has no Convex URL:
 * then online play is off. `auth`, `games`, `invites`, `pushTokens`,
 * `notifications` and `onlineData` are all set, or all `undefined`. The game route
 * connects through `useOnlineConnection` (`features/online/connection.ts`).
 */
const online = createOnlineServices(convexServer(), {
  createAuth: (baseURL) =>
    createBetterAuthProvider({
      baseURL,
      scheme: APP_SCHEME,
      // The session cookie signs the user in: it lives in the secure store.
      storage: createSecureSessionStorage(),
      // Apple's client id for the code trade (#398): this app's bundle id.
      appleClientId: Platform.OS === 'ios' ? Application.applicationId : null,
    }),
  createClient: createConvexClient,
  createGames: (client) => createConvexGameTransport({ client }),
  createInvites: (client) => createConvexInvites({ client }),
  createPushTokens: (client) => createConvexPushTokens({ client }),
  createOnlineData: (client) => createConvexOnlineData({ client }),
  createAppUpdates: (client) => createConvexAppUpdates({ client }),
  createUsernames: (client) => createConvexUsernames({ client }),
  createSafety: (client) => createConvexSafety({ client }),
  createFriends: (client) => createConvexFriends({ client }),
  createRatings: (client) => createConvexRatings({ client }),
  createNotifications: () =>
    createExpoPushNotifications({
      platform: Platform.OS === 'android' ? 'android' : 'ios',
      projectId: easProjectId(),
      // The Android channel shows this name in the phone's settings.
      channelName: () => t('notifications.channel'),
    }),
});

/**
 * Sign-in for online play. Nothing signs in at start: the sign-in choices
 * (`features/online/SignInChoices.tsx`, #401) show at the first online
 * tap, when the user makes or opens an invite, and make a guest or sign in
 * with Apple there.
 */
export const auth: AuthProvider | undefined = online?.auth;

/**
 * Sign in with Apple (#401): Apple's sheet and Apple's own button. iPhone
 * only for now: on Android `isAvailable()` is false. Only the sign-in
 * choices (`features/online/SignInChoices.tsx`) use them, and only with
 * `auth`.
 */
export const appleSheet: AppleSheet = createExpoAppleSheet();
export const AppleSignInButton: ComponentType<AppleSignInButtonProps> = ExpoAppleSignInButton;

/** Online games on the Convex deployment. A screen checks `games === undefined` to show that online play is off. */
export const games: GameTransport | undefined = online?.games;

/**
 * Invites on the Convex deployment (#281): Play a friend makes them, and
 * an invite link opens them. Dev invites (`/dev/online`) use `invitesFor`
 * on the in-memory server instead.
 */
export const invites: Invites | undefined = online?.invites;

/**
 * Turn notifications (#285). `notifications` is the phone side (the
 * permission, the Expo push token, taps on a push), `pushTokens` the
 * server's token list, on the same client as `games`. Both are
 * `undefined` when online play is off. Use them through
 * `features/notifications` (`turnPushes`): it asks only after an async
 * invite, and registers the token only for a signed-in user.
 */
export const notifications: PushNotifications | undefined = online?.notifications;
export const pushTokens: PushTokens | undefined = online?.pushTokens;

/**
 * Delete my account (#315, #402), on the same client as `games`. Only
 * Settings → Account calls it, through `deleteOnlineData`
 * (`features/online/deleteData.ts`).
 */
export const onlineData: OnlineData | undefined = online?.onlineData;

/**
 * The update policy (#390), on the same client as `games`. It needs no
 * sign-in. Only `checkAppUpdate` (`features/update/updateCheck.ts`) calls
 * it, and only where the app already talks to the server.
 */
export const appUpdates: AppUpdates | undefined = online?.appUpdates;

/**
 * Usernames of saved accounts (#405), on the same client as `games`. The
 * username step (`features/online/UsernameForm.tsx`) uses it after a
 * sign-in with a key, and Settings → Username.
 */
export const usernames: Usernames | undefined = online?.usernames;

/**
 * Block and report (#435, App Store guideline 1.2), on the same client as
 * `games`. The Report or block dialog (`features/safety/`) and Settings →
 * Blocked players use it. A dev game uses `devSafetyFor` instead
 * (`useOnlineConnection`).
 */
export const safety: Safety | undefined = online?.safety;

/**
 * Friends of saved accounts (#406), on the same client as `games`. The
 * friends screens (`features/friends/`) use it. A guest gets `NOT_SAVED`.
 */
export const friends: Friends | undefined = online?.friends;

/**
 * Ratings and boards of saved accounts (#407), on the same client as
 * `games`. The Leaderboards screen (`features/ratings/`) uses it, also for
 * "Show me on the global board" on its Everyone tab. A guest gets
 * `NOT_SAVED`.
 */
export const ratings: Ratings | undefined = online?.ratings;

/**
 * This build (#390): the phone system, the store build number and the app
 * id, read from the native app (expo-application). `null` on the web, or
 * when the build number is not a whole number: then the app never shows
 * "Update needed".
 */
export function appBuild(): AppBuild | null {
  return readAppBuild(Platform.OS, Application.nativeBuildVersion, Application.applicationId);
}

/**
 * Dev games (#255): one in-memory server for this app run (`@tavli/online`,
 * no network), where this phone plays as `onlinePlayerId`. The dev route
 * `app/dev/online.tsx` starts games on it vs the bot. Every other online
 * game uses `games` and `auth` above.
 *
 * The in-memory server runs no timers: whoever starts a game on it runs
 * `runDueTimeouts()` (the dev game does, `features/online/devGame.ts`). Its
 * dice come from `createLocalRng`, which is fine for a dev server only.
 * It is built on first use, so a build that never opens a dev game
 * never makes it.
 */
let memoryServer: MemoryGameServer | null = null;
export function onlineServer(): MemoryGameServer {
  memoryServer ??= createMemoryGameServer({ rng: createLocalRng(), now: () => Date.now() });
  return memoryServer;
}

/** The player id of this phone in dev games. */
export const onlinePlayerId = 'me';

const transports = new Map<string, GameTransport>();

/** The dev game port for `playerId`. One transport per player for the app run. */
export function gameTransportFor(playerId: string): GameTransport {
  let transport = transports.get(playerId);
  if (transport === undefined) {
    transport = onlineServer().transportFor(playerId);
    transports.set(playerId, transport);
  }
  return transport;
}

const safetyPorts = new Map<string, Safety>();

/**
 * Dev games' block and report for `playerId`, on the same in-memory server
 * as `gameTransportFor`. One port per player for the app run, like the
 * transports, so a screen gets the same object on each render.
 */
export function devSafetyFor(playerId: string): Safety {
  let port = safetyPorts.get(playerId);
  if (port === undefined) {
    port = onlineServer().safetyFor(playerId);
    safetyPorts.set(playerId, port);
  }
  return port;
}

const invitePorts = new Map<string, Invites>();

/**
 * The dev invite port for `playerId` (#256), on the same in-memory server
 * as `gameTransportFor`: an accepted invite starts its game there. One
 * port per player for the app run. Only dev invites (`isDevInvite`,
 * `features/online/devGameIds.ts`) use it; every other invite is on
 * Convex (`invites` above).
 */
export function invitesFor(playerId: string): Invites {
  let invites = invitePorts.get(playerId);
  if (invites === undefined) {
    invites = onlineServer().invitesFor(playerId);
    invitePorts.set(playerId, invites);
  }
  return invites;
}
