/**
 * What Home's tiles say about the player (#517): the rating on Play ranked
 * and the friend requests waiting on Friends.
 *
 * - Home asks only on a phone that has an online account
 *   (`hasOnlineAccount()`, the `enabled` flag), so a phone that never
 *   played online makes no server call. It never makes an account.
 * - It loads each time Home comes into view (`focused`). Only the newest
 *   load may set the news.
 * - A guest or nobody signed in gives no news: the tiles keep their own
 *   lines, with no spinner and no error. Ratings and friends need a saved
 *   account (`NOT_SAVED`).
 * - A part whose call fails keeps what it showed: the rating and the
 *   request count load and fail on their own (`applyTileNews`).
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

/**
 * One load's answer: whose news it is (`null`: nobody, or a guest) and each
 * part that loaded. A part that failed is left out.
 */
export interface TileNewsLoad {
  readonly user: string | null;
  readonly update: Partial<TileNews>;
}

/** The news on show and whose it is. */
export interface ShownTileNews {
  readonly user: string | null;
  readonly news: TileNews;
}

export const NO_SHOWN_NEWS: ShownTileNews = { user: null, news: NO_TILE_NEWS };

/**
 * The news after a load. A part left out of the update keeps its old value,
 * but only for the same user: another user starts from no news, so a failed
 * call never shows the last user's rating.
 */
export function applyTileNews(shown: ShownTileNews, load: TileNewsLoad): ShownTileNews {
  const base = load.user !== null && load.user === shown.user ? shown.news : NO_TILE_NEWS;
  return { user: load.user, news: { ...base, ...load.update } };
}

/** Loads the news once. Each part that fails is left out. */
export async function loadTileNews(
  auth: AuthProvider,
  ratings: Ratings | undefined,
  friends: Friends | undefined,
): Promise<TileNewsLoad> {
  // `loadSession()`, not `ready()`: a rejection is no network and keeps
  // what shows; `null` is a real sign-out (#297).
  const user = await auth.loadSession();
  if (user === null || user.isGuest) return { user: null, update: {} };
  const [mine, requests] = await Promise.allSettled([
    ratings ? ratings.mine() : Promise.reject(new Error('no ratings')),
    friends ? friends.listRequests() : Promise.reject(new Error('no friends')),
  ]);
  return {
    user: user.id,
    update: {
      ...(mine.status === 'fulfilled'
        ? { rating: mine.value.matches > 0 ? mine.value.rating : null }
        : {}),
      ...(requests.status === 'fulfilled'
        ? { friendRequests: requests.value.incoming.length }
        : {}),
    },
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
  const [shown, setShown] = useState<ShownTileNews>(NO_SHOWN_NEWS);
  // Only the newest load may set the news.
  const loads = useRef(0);
  const active = enabled && auth !== undefined && (ratings !== undefined || friends !== undefined);
  // Turned off (a sign-out): forget the news, so the next user never sees
  // the last one's rating.
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setShown(NO_SHOWN_NEWS);
  }

  // Another user signed in (also while Home is out of view): forget the
  // last user's news at once.
  useEffect(() => {
    if (auth === undefined) return;
    return auth.onChange((user) => {
      const id = user?.id ?? null;
      setShown((last) => (last.user === id ? last : NO_SHOWN_NEWS));
    });
  }, [auth]);

  useEffect(() => {
    if (!focused) return;
    loads.current += 1;
    const n = loads.current;
    if (!active || auth === undefined) return;
    loadTileNews(auth, ratings, friends).then(
      (load) => {
        if (n === loads.current) setShown((last) => applyTileNews(last, load));
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
  return active ? shown.news : NO_TILE_NEWS;
}
