/**
 * The `PushNotifications` port on expo-notifications (#285).
 *
 * - No call rejects or throws: a failed native call (a simulator, no
 *   network, Expo Go) gives `denied`, no token or no tap.
 * - `permission` maps the phone's answer: iOS "provisional" and
 *   "ephemeral" count as `granted`. An Android "no" that the system lets
 *   the app ask once more (`canAskAgain`) counts as `undetermined`.
 * - `requestPermission` shows the system prompt only while the answer is
 *   `undetermined`. On Android it first makes the channel the pushes
 *   use: Android 13 shows no prompt before an app has a channel.
 * - `getToken` asks Expo for a token only when the permission is
 *   `granted` and the build has an EAS project id (`extra.eas.projectId`).
 * - Taps: only a tap on the push itself (`DEFAULT_ACTION_IDENTIFIER`).
 *   `lastTap` reads the tap that opened the app and clears it, so it
 *   opens the game once.
 *
 * The app does not set a foreground handler (`setNotificationHandler`),
 * so a push that comes while the app is open is not shown: the open game
 * shows the turn by itself. See README.md.
 */
import { gameIdOfPush } from '@tavli/contracts';
import type { PushNotifications, PushPermission, PushPlatform, PushTap } from '@tavli/contracts';
import {
  AndroidImportance,
  DEFAULT_ACTION_IDENTIFIER,
  IosAuthorizationStatus,
  addNotificationResponseReceivedListener,
  addPushTokenListener,
  clearLastNotificationResponse,
  getExpoPushTokenAsync,
  getLastNotificationResponse,
  getPermissionsAsync,
  requestPermissionsAsync,
  setNotificationChannelAsync,
} from 'expo-notifications';
import type {
  DevicePushToken,
  NotificationPermissionsStatus,
  NotificationResponse,
} from 'expo-notifications';

/**
 * The Android channel of the pushes. The server sends no channel id, so
 * Android uses the channel `default`: the app makes it with its own name
 * and a high importance (the push shows at once).
 */
export const ANDROID_CHANNEL_ID = 'default';

export interface ExpoPushNotificationsOptions {
  readonly platform: PushPlatform;
  /**
   * The EAS project id (`extra.eas.projectId`, written by `eas init`).
   * Without it Expo gives no token, so `getToken` gives `null`.
   */
  readonly projectId: string | undefined;
  /** The name of the Android channel, in the app language. Read when the channel is made. */
  readonly channelName: () => string;
}

/** What the phone allows, as the port says it. */
export function toPermission(status: NotificationPermissionsStatus): PushPermission {
  if (status.granted) return 'granted';
  const ios = status.ios?.status;
  if (ios === IosAuthorizationStatus.PROVISIONAL || ios === IosAuthorizationStatus.EPHEMERAL) {
    return 'granted';
  }
  if (status.status === 'undetermined') return 'undetermined';
  // Android 13 lets the app show the prompt once more after the first "no".
  return status.canAskAgain ? 'undetermined' : 'denied';
}

/** The tap in a response, or `null` when it was not a tap on the push itself. */
export function tapOf(response: NotificationResponse | null): PushTap | null {
  if (response === null || response.actionIdentifier !== DEFAULT_ACTION_IDENTIFIER) return null;
  const { request } = response.notification;
  return { id: request.identifier, gameId: gameIdOfPush(request.content.data) };
}

/** Runs `call`; a throw or a rejection gives `fallback`. */
async function safely<T>(call: () => Promise<T> | T, fallback: T): Promise<T> {
  try {
    return await call();
  } catch {
    return fallback;
  }
}

/** Runs `call`; a throw gives `fallback`. */
function safelyNow<T>(call: () => T, fallback: T): T {
  try {
    return call();
  } catch {
    return fallback;
  }
}

export function createExpoPushNotifications(
  options: ExpoPushNotificationsOptions,
): PushNotifications {
  const { platform, projectId, channelName } = options;
  let channel: Promise<void> | null = null;
  /** The last token this port gave out, so a token change is told only when it is new. */
  let latest: string | null = null;
  /** A `getToken` call that has not resolved yet. */
  let fetching: Promise<string | null> | null = null;
  const tokenListeners = new Set<(token: string) => void>();
  let tokenSubscription: { remove(): void } | null = null;

  /** Makes the Android channel once. A failed try is tried again next time. */
  function makeChannel(): Promise<void> {
    if (platform !== 'android') return Promise.resolve();
    channel ??= setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: channelName(),
      importance: AndroidImportance.HIGH,
    }).then(
      () => undefined,
      () => {
        channel = null;
      },
    );
    return channel;
  }

  const permission = () => safely(async () => toPermission(await getPermissionsAsync()), 'denied');

  async function expoToken(devicePushToken?: DevicePushToken): Promise<string | null> {
    if (projectId === undefined || projectId === '') return null;
    const { data } = await getExpoPushTokenAsync(
      devicePushToken === undefined ? { projectId } : { projectId, devicePushToken },
    );
    return typeof data === 'string' && data !== '' ? data : null;
  }

  function tokenChanged(device: DevicePushToken): void {
    void safely(async () => {
      // A `getToken` in flight fires this listener too: wait for its token.
      if (fetching !== null) await fetching;
      if ((await permission()) !== 'granted') return;
      const token = await expoToken(device);
      if (token === null || token === latest) return;
      latest = token;
      for (const listener of [...tokenListeners]) {
        if (tokenListeners.has(listener)) listener(token);
      }
    }, undefined);
  }

  return {
    platform,
    permission,

    async requestPermission() {
      const now = await permission();
      if (now !== 'undetermined') return now;
      return safely(async () => {
        await makeChannel();
        const answer = toPermission(await requestPermissionsAsync());
        // A "no" is a no, even when Android would let the app ask once more.
        return answer === 'granted' ? 'granted' : 'denied';
      }, 'denied');
    },

    getToken() {
      const call = safely(async () => {
        if ((await permission()) !== 'granted') return null;
        await makeChannel();
        const token = await expoToken();
        if (token !== null) latest = token;
        return token;
      }, null);
      fetching = call;
      void call.then(() => {
        if (fetching === call) fetching = null;
      });
      return call;
    },

    onTokenChange(listener) {
      const own = (token: string) => listener(token);
      tokenListeners.add(own);
      tokenSubscription ??= safelyNow(() => addPushTokenListener(tokenChanged), null);
      return () => {
        if (!tokenListeners.delete(own)) return;
        if (tokenListeners.size === 0 && tokenSubscription !== null) {
          const subscription = tokenSubscription;
          tokenSubscription = null;
          safelyNow(() => subscription.remove(), undefined);
        }
      };
    },

    lastTap() {
      return safely(() => {
        const tap = tapOf(getLastNotificationResponse());
        // Read once: a later call (or a new root screen) must not open it again.
        if (tap !== null) clearLastNotificationResponse();
        return tap;
      }, null);
    },

    onTap(listener) {
      let active = true;
      const subscription = safelyNow(
        () =>
          addNotificationResponseReceivedListener((response) => {
            const tap = tapOf(response);
            if (tap === null) return;
            // Never inside the native call: on a microtask, like every port.
            void Promise.resolve().then(() => {
              if (active) listener(tap);
            });
          }),
        null,
      );
      return () => {
        if (!active) return;
        active = false;
        if (subscription !== null) safelyNow(() => subscription.remove(), undefined);
      };
    },
  };
}
