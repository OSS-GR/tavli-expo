/**
 * A tap on a turn push (#285) opens its game (`game/<gameId>`, from the
 * push's `data.gameId`).
 *
 * The root layout (`app/_layout.tsx`) listens. A tap waits here until its
 * game is on the screen (#325):
 * - While the welcome flow is due (first launch, or a new consent text),
 *   it waits: the welcome group's redirect opens the game after the
 *   answer, the way `usePendingInvite` keeps an invite link. When an
 *   invite link wins that redirect, the game opens after the invite.
 * - Else the layout navigates. A tap counts as opened only when the path
 *   is its game (or a screen of it). On a cold start the router may not take the first
 *   navigation (the native last tap is read once, so nothing would give
 *   it again): the layout tries again after `RETRY_MS`, at most
 *   `MAX_TRIES` times, then drops the tap.
 *
 * A push only opens an online game: an id that is not one (a local save
 * slot, or not an id at all) does nothing.
 */
import type { PushNotifications, PushTap } from '@tavli/contracts';
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { createStore, useStore } from 'zustand';

import { gameHref, isLocalGameId } from '@/features/match/routes';

/** A Convex document id: letters and digits. Anything else in a push is not a game. */
const GAME_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** How long the layout waits before it tries a navigation again. */
export const PUSH_TAP_RETRY_MS = 500;

/** How many times the layout navigates to the game of one tap. */
export const PUSH_TAP_MAX_TRIES = 3;

/** The game a tap opens, or `null`. */
export function gameOfTap(tap: PushTap): string | null {
  const { gameId } = tap;
  if (gameId === null || !GAME_ID.test(gameId) || isLocalGameId(gameId)) return null;
  return gameId;
}

/** A tap whose game is not on the screen yet. */
interface WaitingTap {
  readonly id: string;
  readonly gameId: string;
}

/**
 * The tap that waits for its game, outside React: it outlives a new root
 * layout (the crash screen's Restart), like the native last tap it came from.
 */
const waitingStore = createStore<{ waiting: WaitingTap | null }>(() => ({ waiting: null }));

/**
 * The taps that are done in this app run: opened, or dropped after
 * `PUSH_TAP_MAX_TRIES`. The tap that opens the app can come twice (as the
 * last tap and to the listener): it opens once.
 */
const done = new Set<string>();

/** Navigations tried per waiting tap. */
const tries = new Map<string, number>();

/** Keeps a tap until its game is on the screen. The newest tap wins. */
function receive(tap: PushTap): void {
  if (done.has(tap.id) || waitingStore.getState().waiting?.id === tap.id) return;
  const gameId = gameOfTap(tap);
  if (gameId === null) return;
  waitingStore.setState({ waiting: { id: tap.id, gameId } });
}

/** The tap is opened (or dropped): it never opens again in this app run. */
function finish(tap: WaitingTap): void {
  done.add(tap.id);
  tries.delete(tap.id);
  if (waitingStore.getState().waiting?.id === tap.id) waitingStore.setState({ waiting: null });
}

/** Forgets the taps (`test/afterEnv.ts`). */
export function forgetPushTapsForTest(): void {
  done.clear();
  tries.clear();
  waitingStore.setState({ waiting: null });
}

/**
 * Opens the game of each tap on a turn push. Returns the game of a tap
 * that is not open yet (the welcome group redirects to it), else `null`.
 */
export function usePushTaps(
  welcome: boolean,
  notifications: PushNotifications | undefined,
): string | null {
  const pathname = usePathname();
  const waiting = useStore(waitingStore, (s) => s.waiting);
  // Bumped by the retry timer: the effect below runs again.
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (notifications === undefined) return;
    let live = true;
    const stop = notifications.onTap(receive);
    // The tap that opened the app (it came before this listener).
    void notifications.lastTap().then((tap) => {
      if (live && tap !== null) receive(tap);
    });
    return () => {
      live = false;
      stop();
    };
  }, [notifications]);

  useEffect(() => {
    // The welcome flow first: its redirect opens the game (or an invite,
    // and the game after it, once the path has left the welcome routes).
    if (waiting === null || welcome || pathname.startsWith('/welcome')) return;
    // The game, or a screen of it (a finished game replaces its board
    // with the match end).
    const game = `/game/${waiting.gameId}`;
    if (pathname === game || pathname.startsWith(`${game}/`)) {
      finish(waiting);
      return;
    }
    const tried = tries.get(waiting.id) ?? 0;
    if (tried >= PUSH_TAP_MAX_TRIES) {
      finish(waiting);
      return;
    }
    tries.set(waiting.id, tried + 1);
    try {
      router.navigate(gameHref(waiting.gameId));
    } catch {
      // The router is not ready: the timer tries again.
    }
    // A navigation that works changes the path first, and this effect runs
    // again before the timer.
    const timer = setTimeout(() => setRetry((n) => n + 1), PUSH_TAP_RETRY_MS);
    return () => clearTimeout(timer);
  }, [waiting, welcome, pathname, retry]);

  return waiting?.gameId ?? null;
}
