/**
 * "Update needed" (#390): when the app asks the server for its update
 * policy, and what it knows.
 *
 * The app asks only where it already talks to the server, so a player who
 * never plays online makes no network call at start (#266):
 * - Home and History, when they load the saved session's lists
 *   (`useSessionWatch`);
 * - Play a friend, when it opens on a phone that played online before
 *   (`hasOnlineAccount()`): the privacy policy says the app does not talk
 *   to the server before the first invite;
 * - an invite link, Make an invite and each sign-in (`onlineAccountReady`);
 * - an online game route, a push tap too (`useOnlineConnection`).
 *
 * After the first check of an app run, the root layout asks again each
 * time the app comes back to the foreground (`UpdateGate`). A failed call
 * keeps the last answer: no answer blocks nothing. The call sends the
 * phone system only; the build is compared on the phone (`decision.ts`).
 */
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { AppUpdatePolicy } from '@tavli/contracts';

import { appBuild, appUpdates } from '@/services';

export interface UpdateCheckState {
  /** The newest answer of this app run, or `null` before the first one. */
  readonly policy: AppUpdatePolicy | null;
  /** The app asked at least once in this app run: it may ask again on foreground. */
  readonly asked: boolean;
  /** How many online game screens are open (`useOnlineGameShowing`). */
  readonly onlineGames: number;
}

const INITIAL: UpdateCheckState = { policy: null, asked: false, onlineGames: 0 };

export const updateCheckStore = createStore<UpdateCheckState>()(() => INITIAL);

/** Reads the update check in a component. */
export function useUpdateCheck<T>(selector: (state: UpdateCheckState) => T): T {
  return useStore(updateCheckStore, selector);
}

let pending: Promise<void> | null = null;

/**
 * Asks the server for the update policy of this phone system, unless a
 * call is on its way. Never rejects. Does nothing in a build with no
 * server or no store build number.
 */
export function checkAppUpdate(): Promise<void> {
  const build = appBuild();
  if (appUpdates === undefined || build === null) return Promise.resolve();
  if (pending !== null) return pending;
  updateCheckStore.setState({ asked: true });
  const call = appUpdates.updatePolicy(build.platform).then(
    (policy) => updateCheckStore.setState({ policy }),
    () => {
      // No network: keep the last answer. The next check tries again.
    },
  );
  pending = call.finally(() => {
    pending = null;
  });
  return pending;
}

/**
 * Asks for the update policy when the screen opens and `enabled` is true
 * (see `checkAppUpdate`).
 */
export function useAppUpdateCheck(enabled: boolean): void {
  useEffect(() => {
    if (enabled) void checkAppUpdate();
  }, [enabled]);
}

/**
 * Asks again each time the app comes back to the foreground, once it has
 * asked in this app run: the owner may have raised the lowest build while
 * the app was in the background. A phone that never asked makes no call.
 */
export function useForegroundUpdateCheck(): void {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && updateCheckStore.getState().asked) void checkAppUpdate();
    });
    return () => subscription.remove();
  }, []);
}

/**
 * Marks an open online game screen (`active`), so "Update needed" waits
 * until the player leaves it (unless the server forces it).
 */
export function useOnlineGameShowing(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const change = (by: number) =>
      updateCheckStore.setState((state) => ({ onlineGames: state.onlineGames + by }));
    change(1);
    return () => change(-1);
  }, [active]);
}

/** Tests only: a new app run (`test/afterEnv.ts`). */
export function resetUpdateCheckForTest(): void {
  pending = null;
  updateCheckStore.setState(INITIAL, true);
}
