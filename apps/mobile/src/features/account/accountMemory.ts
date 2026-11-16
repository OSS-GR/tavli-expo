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
 * - A slow warm-up never writes over a newer load (`changes`), and a
 *   username save updates it (`renameKnownAccount`).
 * - Never send it to analytics or the logs.
 */
import type { AuthProvider, Usernames } from '@tavli/contracts';

import { hasOnlineAccount } from '@/features/online/accountHint';

import type { AccountState } from './useAccount';

export type KnownAccount = Extract<AccountState, { readonly kind: 'guest' | 'saved' }>;

let known: KnownAccount | null = null;
/** Counts each change, so a slow warm-up never writes over newer news. */
let changes = 0;
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
  if (state.kind === 'guest' || state.kind === 'saved') set(state);
  else if (state.kind === 'offline') set(null);
}

/** Forgets the account: what is known may be out of date. */
export function forgetAccount(): void {
  set(null);
}

/** A new username (the username form): the known account shows it at once. */
export function renameKnownAccount(name: string | null): void {
  if (known?.kind === 'saved') set({ ...known, username: name });
}

function set(next: KnownAccount | null): void {
  known = next;
  changes += 1;
}

/**
 * Loads the account once per app run, for Home (#567). It never signs in
 * or out, and a failed load is quiet: Settings and Account load again.
 */
export function warmAccount(auth: AuthProvider, usernames: Usernames): void {
  if (warming || known !== null || !hasOnlineAccount()) return;
  warming = true;
  const start = changes;
  // Only an answer with no newer change since the start is kept.
  const keep = (next: KnownAccount) => {
    if (changes === start) set(next);
  };
  void (async () => {
    const user = await auth.ready();
    if (user === null) return;
    const mine = await usernames.mine();
    const guestNumber = mine.guestNumber ?? null;
    if (user.isGuest || !mine.saved) {
      keep({ kind: 'guest', id: user.id, guestNumber });
      return;
    }
    const keys = await auth.listKeys();
    keep({ kind: 'saved', id: user.id, username: mine.name, guestNumber, keys });
  })()
    .catch(() => {
      // Quiet: the screens load anyway.
    })
    .finally(() => {
      // Once per app run when it worked; a later Home may try again if not.
      warming = known !== null;
    });
}

export function forgetAccountForTest(): void {
  known = null;
  changes = 0;
  warming = false;
}
