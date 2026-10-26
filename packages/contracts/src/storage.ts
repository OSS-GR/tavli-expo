/**
 * Storage port: a small, synchronous key-value store for local data such as
 * settings. Values are strings; callers serialize to JSON themselves.
 *
 * It is synchronous on purpose. The app reads settings before the first
 * frame, so the screen never shows the wrong language or theme.
 *
 * Adapters: `@tavli/storage-mmkv` (the app), `createMemoryStorage` (tests).
 */
export interface Storage {
  /** The stored value, or `undefined` if the key is missing. */
  getString(key: string): string | undefined;
  setString(key: string, value: string): void;
  /** Deletes the key. Does nothing if it is missing. */
  remove(key: string): void;
}

/**
 * An in-memory `Storage`. Use it in tests and as a fallback. Data is lost when
 * the process ends.
 */
export function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    getString: (key) => data.get(key),
    setString: (key, value) => {
      data.set(key, value);
    },
    remove: (key) => {
      data.delete(key);
    },
  };
}
