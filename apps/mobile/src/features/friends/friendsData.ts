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
      /** The `visit` the load started on. */
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

/**
 * Runs `load` as the signed-in player. `reload` loads again and keeps
 * what shows until the answer comes; `retry` shows the spinner first.
 * An older answer never replaces a newer one. A new `visit` (the route
 * counts each time the screen shows, `useVisit`) loads again too, so a
 * screen is fresh when the player comes back to it; until that load
 * answers, `current` is false. A quiet reload that fails keeps what shows
 * (a call on it may still run) and marks it `refreshFailed`, so the
 * screen says it may be old; a sign-out or a guest still replaces it.
 * `replace` shows what a call just changed (a new friend link) and loads
 * again: a load that started before it is dropped, so it never brings the
 * old data back.
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
        const problem = friendsProblem(error);
        settle(
          problem === 'notSaved'
            ? { kind: 'guest' }
            : problem === 'signedOut'
              ? { kind: 'signedOut' }
              : { kind: 'failed' },
        );
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
      setState((shown) =>
        shown.kind === 'ready' ? { ...shown, data: change(shown.data) } : shown,
      );
      // A new load drops the older ones (they may hold the data from
      // before the change) and brings the rest up to date.
      reload();
    },
    [reload],
  );

  /** What shows is from this visit, and its last reload worked. */
  const current = state.kind === 'ready' && state.visit === visit && state.refreshFailed !== true;

  return { state, current, reload, retry, replace };
}
