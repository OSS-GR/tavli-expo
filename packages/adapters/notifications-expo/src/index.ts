/**
 * `PushNotifications` adapter.
 *
 * - On a phone it is backed by expo-notifications (`expo.ts`), the only
 *   file that may import it.
 * - In a browser Metro picks `expo.web.ts`: nothing happens there until the
 *   web gets its own push (the web plan, phase 3). expo-notifications on the
 *   web logs errors when it loads, so the web build must not load it (#675).
 */
export * from './expo';
