/**
 * The phone's secure store (iOS Keychain, Android Keystore) for the
 * session cookie (#266). The cookie signs the user in, so it does not go
 * in MMKV.
 */
import * as SecureStore from 'expo-secure-store';

import type { SessionStorage } from './client';

/**
 * `expo-secure-store` as `SessionStorage`. A value the phone cannot read
 * (for example a backup restored on a new phone, without the old key) reads
 * as `null`: the user is then signed out, and the app still starts.
 */
export function createSecureSessionStorage(): SessionStorage {
  return {
    getItem(key) {
      try {
        return SecureStore.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      SecureStore.setItem(key, value);
    },
  };
}
