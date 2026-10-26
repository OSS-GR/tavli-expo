/**
 * `Storage` adapter backed by MMKV (react-native-mmkv 4, a Nitro module).
 *
 * MMKV needs native code, so it works in development builds, not Expo Go.
 * In Jest, react-native-mmkv switches to its own in-memory mock by itself.
 */
import type { Storage } from '@tavli/contracts';
import { createMMKV } from 'react-native-mmkv';

export interface MmkvStorageOptions {
  /** MMKV instance id. Each id is a separate file on the device. */
  id?: string;
}

export function createMmkvStorage({ id = 'tavlaki' }: MmkvStorageOptions = {}): Storage {
  const mmkv = createMMKV({ id });
  return {
    getString: (key) => mmkv.getString(key),
    setString: (key, value) => {
      mmkv.set(key, value);
    },
    remove: (key) => {
      mmkv.remove(key);
    },
  };
}
