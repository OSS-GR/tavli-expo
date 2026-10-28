/**
 * A live list of the saved session (#297, #314): "Your online games" and
 * "Your invites" on Home.
 *
 * The hook reads the session (`auth.ready()`) and follows sign-in and
 * sign-out (`auth.onChange`). It never makes an account: with no saved
 * session it shows nothing. Never send the user id to analytics.
 */
import type { AuthProvider, AuthUser } from '@tavli/contracts';
import { useCallback, useEffect, useState } from 'react';

import { forgetOnlineAccount } from './accountHint';

export type SessionWatchState<Loaded extends object> =
  /** No saved session: no list at all. */
  | { readonly status: 'signedOut' }
  /** Loading the session, then the first list. */
  | { readonly status: 'loading' }
  /**
   * The newest list, as `toLoaded` made it. `failed`: the watch failed
   * after this list came, so it may be old.
   */
  | (Loaded & { readonly status: 'loaded'; readonly failed: boolean })
  /**
   * The session or the first list did not load. `retry` tries again. A
   * session that `ready()` gives as `null` counts as this too: Better Auth
   * gives `null` when it cannot reach the server, so that is no sign-out.
   */
  | { readonly status: 'failed' };

/**
 * Starts a watch of the signed-in user's list (for example
 * `games.watchMyGames`). Returns the stop function.
 */
export type StartSessionWatch<Value> = (
  onValue: (value: Value) => void,
  onError: (error: unknown) => void,
) => () => void;

/**
 * A list of the saved session, live. It reads the session and follows
 * `auth.onChange`; for each user it runs `start` and turns each value
 * into the loaded state with `toLoaded`. A failure after a list came
 * keeps that list (`failed: true`); `retry` starts the watch again.
 *
 * Only `onChange(null)` is a sign-out: it shows `signedOut` and forgets
 * the account note (`forgetOnlineAccount`). `ready()` giving `null` may
 * only mean no network (Better Auth's `ready()` never rejects), so it
 * shows `failed` and keeps the note; `retry` loads the session again.
 *
 * `start` and `toLoaded` restart the watch when they change: keep them
 * stable (`useCallback`).
 */
export function useSessionWatch<Value, Loaded extends object>(
  auth: AuthProvider,
  start: StartSessionWatch<Value>,
  toLoaded: (value: Value) => Loaded,
): { readonly state: SessionWatchState<Loaded>; readonly retry: () => void } {
  const [state, setState] = useState<SessionWatchState<Loaded>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    /** The user the watch is for: `undefined` before the session loads. */
    let current: string | null | undefined;
    let stop: (() => void) | null = null;

    /** Keeps the list on a failure; with no list yet the load failed. */
    const fail = () => {
      if (!live) return;
      setState((last) =>
        last.status === 'loaded' ? { ...last, failed: true } : { status: 'failed' },
      );
    };

    const follow = (user: AuthUser | null) => {
      if (!live) return;
      const id = user?.id ?? null;
      if (id === current) return;
      const switched = current !== undefined;
      current = id;
      stop?.();
      stop = null;
      if (id === null) {
        // Signed out: Home stops loading the session at start.
        forgetOnlineAccount();
        setState({ status: 'signedOut' });
        return;
      }
      // Another user's list is not this user's: load it from scratch. A
      // retry keeps the old list of the same user until the new one comes.
      setState((last) => (switched || last.status !== 'loaded' ? { status: 'loading' } : last));
      stop = start((value) => {
        if (!live) return;
        setState({ ...toLoaded(value), status: 'loaded', failed: false });
      }, fail);
    };

    /** No session from `ready()`: maybe no network, so no sign-out. */
    const loaded = (user: AuthUser | null) => {
      if (user !== null) follow(user);
      else if (current === undefined) fail();
    };

    const unsubscribe = auth.onChange(follow);
    auth.ready().then(loaded, fail);
    return () => {
      live = false;
      unsubscribe();
      stop?.();
    };
  }, [auth, start, toLoaded, attempt]);

  const retry = useCallback(() => {
    setState((last) => (last.status === 'failed' ? { status: 'loading' } : last));
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}
