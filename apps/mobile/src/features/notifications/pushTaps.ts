/**
 * A tap on a turn push (#285) opens its game (`game/<gameId>`, from the
 * push's `data.gameId`).
 *
 * The root layout (`app/_layout.tsx`) listens. A tap while the welcome
 * flow is due (first launch, or a new consent text) waits: the welcome
 * group's redirect opens the game after the answer, the way
 * `usePendingInvite` keeps an invite link. A push only opens an online
 * game: an id that is not one (a local save slot, or not an id at all)
 * does nothing.
 */
import type { PushNotifications, PushTap } from '@tavli/contracts';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { gameHref, isLocalGameId } from '@/features/match/routes';

/** A Convex document id: letters and digits. Anything else in a push is not a game. */
const GAME_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The game a tap opens, or `null`. */
export function gameOfTap(tap: PushTap): string | null {
  const { gameId } = tap;
  if (gameId === null || !GAME_ID.test(gameId) || isLocalGameId(gameId)) return null;
  return gameId;
}

/**
 * The taps that opened a game in this app run. The tap that opens the app
 * can come twice (as the last tap and to the listener): it opens once.
 */
const opened = new Set<string>();

/** Forgets the opened taps (`test/afterEnv.ts`). */
export function forgetPushTapsForTest(): void {
  opened.clear();
}

/**
 * Opens the game of each tap on a turn push. Returns the game a tap opened
 * while `welcome` (the first-launch flow) was due, until the welcome flow
 * has redirected to it. Else `null`.
 */
export function usePushTaps(
  welcome: boolean,
  notifications: PushNotifications | undefined,
): string | null {
  const pathname = usePathname();
  const [pending, setPending] = useState<string | null>(null);
  // The handler runs later (a tap): it reads the flow of that moment.
  const welcomeNow = useRef(welcome);
  useEffect(() => {
    welcomeNow.current = welcome;
  }, [welcome]);

  useEffect(() => {
    if (notifications === undefined) return;
    let live = true;
    const open = (tap: PushTap | null) => {
      if (!live || tap === null || opened.has(tap.id)) return;
      const gameId = gameOfTap(tap);
      if (gameId === null) return;
      opened.add(tap.id);
      if (welcomeNow.current) setPending(gameId);
      else router.navigate(gameHref(gameId));
    };
    const stop = notifications.onTap(open);
    // The tap that opened the app (it came before this listener).
    void notifications.lastTap().then(open);
    return () => {
      live = false;
      stop();
    };
  }, [notifications]);

  // The answer is in and the router has left the welcome routes (to the
  // game, or anywhere else): nothing waits any more. Set while rendering,
  // like `usePendingInvite`.
  if (!welcome && !pathname.startsWith('/welcome') && pending !== null) setPending(null);
  return pending;
}
