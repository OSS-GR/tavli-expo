/**
 * A note on this phone: "an online account was used here" (#297).
 *
 * Home lists the online games of the saved session. Loading that session
 * (`auth.ready()`) asks the server, so Home does it only when this note
 * is set. A phone that never played online makes no network call at
 * start (#266).
 *
 * The note is set when a screen finds or makes the account
 * (`signInForOnline`, `useOnlineAccount`, `useOnlineConnection`). Home
 * removes it only on a sign-out (`auth.onChange(null)`). A session that
 * `ready()` gives as `null` keeps it: Better Auth gives `null` when it
 * cannot reach the server too, and a launch with no network must not
 * hide the list for good. It holds no id: only `1`,
 * under `ONLINE_ACCOUNT_KEY` in the `Storage` port. It never leaves the
 * phone.
 */
import { storage } from '@/services';

export const ONLINE_ACCOUNT_KEY = 'onlineAccount';

/** True when an online account was used on this phone, and nobody signed out since. */
export function hasOnlineAccount(): boolean {
  try {
    return storage.getString(ONLINE_ACCOUNT_KEY) === '1';
  } catch {
    return false;
  }
}

/** Notes that this phone has an online account. */
export function rememberOnlineAccount(): void {
  try {
    if (!hasOnlineAccount()) storage.setString(ONLINE_ACCOUNT_KEY, '1');
  } catch {
    // Only a hint: Home then shows no list until the next sign-in.
  }
}

/** Removes the note: the saved session is gone. */
export function forgetOnlineAccount(): void {
  try {
    storage.remove(ONLINE_ACCOUNT_KEY);
  } catch {
    // Only a hint: Home loads the session once more next time.
  }
}
