/**
 * SPIKE (#637): the browser has no secure store. The session cookie value
 * goes in `localStorage` (what Better Auth's own cross-domain client does).
 */
import type { SessionStorage } from './client';

export function createSecureSessionStorage(): SessionStorage {
  const get = (key: string): string | null => {
    try {
      return globalThis.localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  const set = (key: string, value: string): void => globalThis.localStorage.setItem(key, value);
  return {
    getItem: get,
    setItem: set,
    getItemAsync: (key) => Promise.resolve(get(key)),
    setItemAsync: (key, value) => Promise.resolve(set(key, value)),
  };
}
