/**
 * Loads what a friends screen shows (#406), and names what went wrong.
 *
 * The screens ask who is signed in (`auth.ready()`) first and make no
 * account: with nobody signed in they say so. A guest gets `NOT_SAVED`
 * from the server: friends need a saved account (ADR-0008).
 */
import { isFriendsErrorData, type AuthProvider } from '@tavli/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';

export type FriendsLoad<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'signedOut' }
  | { readonly kind: 'guest' }
  | { readonly kind: 'failed' }
  | {
      readonly kind: 'ready';
      readonly data: T;
      /**
       * The `visit` whose load (or `replace`) gave `data`. Older than the
       * screen's visit while that visit's load has not answered.
       */
      readonly visit: number;
      /** The last quiet reload failed: `data` may be old. */
      readonly refreshFailed?: true;
    };

/** What a failed friends call tells the user. */
export type FriendsProblem =
  | 'signedOut'
  | 'notSaved'
  | 'notFound'
  | 'blocked'
  | 'notFriends'
  | 'tooManyFriends'
  | 'tooManyRequests'
  | 'tryLater'
  | 'tooManySearches'
  | 'tooManyInvites'
  | 'failed';

const PROBLEMS = {
  NOT_SIGNED_IN: 'signedOut',
  NOT_SAVED: 'notSaved',
  NOT_FOUND: 'notFound',
  BLOCKED: 'blocked',
  NOT_FRIENDS: 'notFriends',
  TOO_MANY_FRIENDS: 'tooManyFriends',
  TOO_MANY_REQUESTS: 'tooManyRequests',
  TRY_LATER: 'tryLater',
  TOO_MANY_SEARCHES: 'tooManySearches',
  TOO_MANY_INVITES: 'tooManyInvites',
  BAD_REQUEST: 'failed',
} as const satisfies Record<string, FriendsProblem>;

/** The problem of a rejected friends call. Anything else (the network): `failed`. */
export function friendsProblem(error: unknown): FriendsProblem {
  return isFriendsErrorData(error) ? PROBLEMS[error.code] : 'failed';
}

/** The state a call's error leaves: a guest, nobody signed in, or `null` (another problem). */
function lostState(error: unknown): { readonly kind: 'guest' | 'signedOut' } | null {
  const problem = friendsProblem(error);
  return problem === 'notSaved'
    ? { kind: 'guest' }
    : problem === 'signedOut'
      ? { kind: 'signedOut' }
      : null;
}

/**
 * Runs `load` as the signed-in player. `reload` loads again and keeps
 * what shows until the answer comes; `retry` shows the spinner first.
 * An older answer never replaces a newer one.
 *
 * - A new `visit` (the route counts each time the screen shows,
 *   `useVisit`) loads again too, so a screen is fresh when the player
 *   comes back to it.
 * - `current` is true while what shows came from this visit: its load
 *   answered, or `replace` set it. A visit whose load is on its way or
 *   failed is not current.
 * - A quiet reload that fails keeps what shows (a call on it may still
 *   run) and marks it `refreshFailed`, so the screen says it may be old.
 *   On data of this visit it stays current (say, the reload after a New
 *   link or an Ask that worked): a failed reload does not make it wrong.
 * - A sign-out or a guest replaces what shows, from a reload or from a
 *   call (`sessionLost`).
 * - `replace` shows what a call just answered (a new friend link): the
 *   data counts as current, then it loads again. A load that started
 *   before it is dropped, so it never brings the old data back.
 */
export function useFriendsData<T>(auth: AuthProvider, load: () => Promise<T>, visit = 0) {
  const [state, setState] = useState<FriendsLoad<T>>({ kind: 'loading' });
  const live = useRef(true);
  const latest = useRef(0);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const reload = useCallback(() => {
    latest.current += 1;
    const run = latest.current;
    const settle = (next: FriendsLoad<T>) => {
      if (!live.current || run !== latest.current) return;
      setState((shown) =>
        next.kind === 'failed' && shown.kind === 'ready' ? { ...shown, refreshFailed: true } : next,
      );
    };
    auth
      .ready()
      .then(async (user): Promise<FriendsLoad<T>> => {
        if (user === null) return { kind: 'signedOut' };
        if (user.isGuest) return { kind: 'guest' };
        return { kind: 'ready', data: await load(), visit };
      })
      .then(settle, (error: unknown) => {
        settle(lostState(error) ?? { kind: 'failed' });
      });
  }, [auth, load, visit]);

  // A new visit makes a new `reload`: load again.
  useEffect(() => {
    reload();
  }, [reload]);

  const retry = useCallback(() => {
    setState({ kind: 'loading' });
    reload();
  }, [reload]);

  const replace = useCallback(
    (change: (data: T) => T) => {
      // The call just answered: what it gave is right for this visit.
      setState((shown) =>
        shown.kind === 'ready' ? { ...shown, data: change(shown.data), visit } : shown,
      );
      // A new load drops the older ones (they may hold the data from
      // before the change) and brings the rest up to date.
      reload();
    },
    [reload, visit],
  );

  /**
   * A call failed: when it says the session is gone (`NOT_SIGNED_IN`) or
   * the account is a guest (`NOT_SAVED`), show that, as a reload would.
   * True then; the screen shows no problem line for it.
   */
  const sessionLost = useCallback((error: unknown): boolean => {
    const next = lostState(error);
    if (next === null) return false;
    // Drop the loads on their way: they started before the server said so.
    latest.current += 1;
    if (live.current) setState(next);
    return true;
  }, []);

  /** What shows is from this visit (its load answered, or `replace` set it). */
  const current = state.kind === 'ready' && state.visit === visit;

  return { state, current, reload, retry, replace, sessionLost };
}
