/**
 * The real Better Auth client for the app (#131): the Expo plugin keeps
 * the session cookie in the phone's secure store, the anonymous plugin
 * makes guest accounts, and the Convex plugin gets a JWT for the Convex
 * client.
 */
import { expoClient } from '@better-auth/expo/client';
import { convexClient } from '@convex-dev/better-auth/client/plugins';
import type { AuthProvider } from '@tavli/contracts';
import { createAuthClient } from 'better-auth/client';
import { anonymousClient } from 'better-auth/client/plugins';

import { fromBetterAuthClient } from './provider';
import type { BetterAuthClient, FromBetterAuthClientOptions } from './provider';

/** A store with sync calls, like `expo-secure-store` (`getItem` / `setItem`). */
export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
}

export interface BetterAuthProviderOptions extends FromBetterAuthClientOptions {
  /**
   * The Convex site URL (`EXPO_PUBLIC_CONVEX_SITE_URL`, the `.site`
   * domain). Better Auth's routes are under `/api/auth` there.
   */
  readonly baseURL: string;
  /** The app's URL scheme (`tavlaki`, from `app.json`). Also the storage key prefix. */
  readonly scheme: string;
  /**
   * Where the session cookie lives. Use the phone's secure store: the
   * cookie signs the user in.
   */
  readonly storage: SessionStorage;
}

/** Builds the Better Auth Expo client with the plugins we use. */
export function createBetterAuthClient(options: BetterAuthProviderOptions) {
  const { baseURL, scheme, storage } = options;
  return createAuthClient({
    baseURL,
    plugins: [
      expoClient({ scheme, storagePrefix: scheme, storage }),
      anonymousClient(),
      convexClient(),
    ],
  });
}

/** The `AuthProvider` for the app, on the real Better Auth client. */
export function createBetterAuthProvider(options: BetterAuthProviderOptions): AuthProvider {
  const client: BetterAuthClient = createBetterAuthClient(options);
  return fromBetterAuthClient(client, options);
}
