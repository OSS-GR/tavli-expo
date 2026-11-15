/**
 * What Home's tiles say about the player (#517): the rating on Play ranked
 * and the friend requests waiting on Friends.
 *
 * - Home asks only on a phone that has an online account
 *   (`hasOnlineAccount()`, the `enabled` flag), so a phone that never
 *   played online makes no server call. It never makes an account.
 * - It loads each time Home comes into view (`focused`). Only the newest
 *   load may set the news.
 * - A guest, nobody signed in, or a load that fails gives no news: the
 *   tiles keep their own lines, with no spinner and no error. Ratings and
 *   friends need a saved account (`NOT_SAVED`).
 * - Never send the rating or the count to analytics or the logs.
 */
import type { AuthProvider, Friends, Ratings } from '@tavli/contracts';
import { useEffect, useRef, useState } from 'react';

export interface TileNews {
  /** The player's rating, or `null` before the first rated match. `undefined`: no news. */
  readonly rating?: number | null;
  /** Friend requests to the player, waiting for an answer. 0: no news. */
  readonly friendRequests: number;
}

export const NO_TILE_NEWS: TileNews = { friendRequests: 0 };

/** Loads the news once. Each part that fails is left out. */
export async function loadTileNews(
  auth: AuthProvider,
  ratings: Ratings | undefined,
  friends: Friends | undefined,
): Promise<TileNews> {
  const user = await auth.ready();
  if (user === null || user.isGuest) return NO_TILE_NEWS;
  const [mine, requests] = await Promise.allSettled([
    ratings ? ratings.mine() : Promise.reject(new Error('no ratings')),
    friends ? friends.listRequests() : Promise.reject(new Error('no friends')),
  ]);
  return {
    ...(mine.status === 'fulfilled'
      ? { rating: mine.value.matches > 0 ? mine.value.rating : null }
      : {}),
    friendRequests: requests.status === 'fulfilled' ? requests.value.incoming.length : 0,
  };
}

export interface TileNewsOptions {
  readonly auth: AuthProvider | undefined;
  readonly ratings: Ratings | undefined;
  readonly friends: Friends | undefined;
  /** This phone signed in to online play before (`hasOnlineAccount()`). */
  readonly enabled: boolean;
  /** Home is in view: each new view loads again. */
  readonly focused: boolean;
}

/** The tiles' news, loaded each time Home comes into view. */
export function useTileNews({
  auth,
  ratings,
  friends,
  enabled,
  focused,
}: TileNewsOptions): TileNews {
  const [news, setNews] = useState<TileNews>(NO_TILE_NEWS);
  // Only the newest load may set the news.
  const loads = useRef(0);
  const active = enabled && auth !== undefined && (ratings !== undefined || friends !== undefined);

  useEffect(() => {
    if (!focused) return;
    loads.current += 1;
    const n = loads.current;
    if (!active || auth === undefined) return;
    loadTileNews(auth, ratings, friends).then(
      (next) => {
        if (n === loads.current) setNews(next);
      },
      // The session did not load (no network): keep what shows.
      () => {},
    );
    return () => {
      // Home went away or out of view: an answer still on its way is old.
      if (n === loads.current) loads.current += 1;
    };
  }, [auth, ratings, friends, active, focused]);

  // With no online account (a sign-out on another screen), no news.
  return active ? news : NO_TILE_NEWS;
}
