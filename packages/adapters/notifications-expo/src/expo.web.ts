/**
 * The browser twin of `expo.ts` (#675): turn notifications do nothing on
 * the web for now. The permission reads as denied, so the app never offers
 * them and never asks for a token. Web push comes in phase 3 of
 * `docs/architecture/web-app.md`.
 */
import type { PushNotifications, PushPlatform } from '@tavli/contracts';

export interface ExpoPushNotificationsOptions {
  platform: PushPlatform;
  projectId: string | undefined;
  channelName?: () => string;
}

export function createExpoPushNotifications(
  options: ExpoPushNotificationsOptions,
): PushNotifications {
  return {
    platform: options.platform,
    permission: () => Promise.resolve('denied'),
    requestPermission: () => Promise.resolve('denied'),
    getToken: () => Promise.resolve(null),
    onTokenChange: () => () => undefined,
    lastTap: () => Promise.resolve(null),
    onTap: () => () => undefined,
  };
}
