/**
 * The last list each online screen showed (#672), so a screen seen before
 * in this app run opens with it at once and loads the new one quietly,
 * instead of a spinner while it slides in.
 *
 * In memory only, never saved: a new app run starts empty. Each entry
 * belongs to the user who loaded it, so after a sign-out or a switch of
 * account a screen never shows another user's list, not even for one
 * frame. Nothing here goes to analytics or the logs.
 */
import type { AuthProvider } from '@tavli/contracts';

const shown = new Map<string, { readonly userId: string; readonly value: unknown }>();

/** What `key` showed last for the signed-in user, or `undefined`. */
export function cachedFor<T>(auth: AuthProvider | undefined, key: string): T | undefined {
  const userId = auth?.currentUser()?.id;
  if (userId === undefined) return undefined;
  const entry = shown.get(key);
  return entry !== undefined && entry.userId === userId ? (entry.value as T) : undefined;
}

/** Keeps what `key` shows now for the signed-in user. */
export function rememberFor(auth: AuthProvider | undefined, key: string, value: unknown): void {
  const userId = auth?.currentUser()?.id;
  if (userId === undefined) return;
  shown.set(key, { userId, value });
}

/** Tests: start each test with nothing shown before. */
export function resetShownCacheForTest(): void {
  shown.clear();
}
