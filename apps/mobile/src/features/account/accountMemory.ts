/**
 * The last account this app run loaded (#567), so Settings → Account and
 * the Settings account card show it at once instead of "Loading…" on
 * every visit. Both still load again quietly when they show.
 *
 * - It lives in memory only (never on disk): a new app run loads again.
 * - Home fills it once per app run (`warmAccount`), only on a phone that
 *   signed in before (`hasOnlineAccount()`), so even the first visit to
 *   Settings shows the account at once. The Settings card and Account
 *   fill it on each load.
 * - It shows only for the user signed in now (`auth.currentUser()`), and
 *   never when the phone has no online account, so a sign-out, a delete or
 *   another user never shows the old account.
 * - Never send it to analytics or the logs.
 */
import type { AuthProvider, Usernames } from '@tavli/contracts';

import { hasOnlineAccount } from '@/features/online/accountHint';

import type { AccountState } from './useAccount';

export type KnownAccount = Extract<AccountState, { readonly kind: 'guest' | 'saved' }>;

let known: KnownAccount | null = null;
let warming = false;

/** The last loaded account of the user signed in now, or `null`. */
export function knownAccount(auth: AuthProvider): KnownAccount | null {
  if (known === null || !hasOnlineAccount()) return null;
  return auth.currentUser()?.id === known.id ? known : null;
}

/**
 * Keeps a loaded account. `offline` forgets it; `loading` and `failed`
 * keep what is known.
 */
export function rememberAccount(state: AccountState): void {
  if (state.kind === 'guest' || state.kind === 'saved') known = state;
  else if (state.kind === 'offline') known = null;
}

/**
 * Loads the account once per app run, for Home (#567). It never signs in
 * or out, and a failed load is quiet: Settings and Account load again.
 */
export function warmAccount(auth: AuthProvider, usernames: Usernames): void {
  if (warming || known !== null || !hasOnlineAccount()) return;
  warming = true;
  void (async () => {
    const user = await auth.ready();
    if (user === null) return;
    const mine = await usernames.mine();
    const guestNumber = mine.guestNumber ?? null;
    if (user.isGuest || !mine.saved) {
      rememberAccount({ kind: 'guest', id: user.id, guestNumber });
      return;
    }
    const keys = await auth.listKeys();
    rememberAccount({ kind: 'saved', id: user.id, username: mine.name, guestNumber, keys });
  })().catch(() => {
    // Quiet: the next app run tries again, and the screens load anyway.
  });
}

export function forgetAccountForTest(): void {
  known = null;
  warming = false;
}
