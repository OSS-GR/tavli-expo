/**
 * "Your online games" (#297): the active online games of the saved
 * session, live from the server (`GameTransport.watchMyGames`).
 *
 * The hook makes no account: with no saved session it shows nothing. The
 * rest is pure: the order (your turn first), the row text and the time
 * left. Never send the user id to analytics.
 */
import type { AuthProvider, GameSummary, GameTransport } from '@tavli/contracts';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { clockText, clockTickMs } from './clock';
import { useSessionWatch, type SessionWatchState, type StartSessionWatch } from './sessionWatch';
import { timeLeft } from './timeLeft';

/** The most rows Home shows. "See all" opens the whole list. */
export const HOME_GAME_ROWS = 3;

/**
 * The newest list, "your turn" first (`yourTurnFirst`). `offset` is the
 * server clock minus the phone clock, as far as the list tells
 * (`clockOffset`).
 */
export interface MyGamesList {
  readonly games: readonly GameSummary[];
  readonly offset: number;
}

/** The states of `useSessionWatch`: signed out, loading, loaded (`MyGamesList`) or failed. */
export type MyGamesState = SessionWatchState<MyGamesList>;

/** Your turn first; each part keeps the server order (newest change first). */
export function yourTurnFirst(games: readonly GameSummary[]): GameSummary[] {
  return [...games.filter((game) => game.myTurn), ...games.filter((game) => !game.myTurn)];
}

/**
 * The server clock minus the phone clock, as far as a list that arrives
 * at phone time `localNow` tells. The newest change (`updatedAt`) was
 * saved before the list left the server, so the server clock is at least
 * that far. A phone that runs behind is set right; otherwise the phone
 * clock counts (0). The phone may then show a little less time than the
 * server has, never more by more than its clock is wrong. The game screen
 * keeps its own, closer estimate (`timeLeft.ts`).
 */
export function clockOffset(games: readonly GameSummary[], localNow: number): number {
  const newest = Math.max(...games.map((game) => game.updatedAt), localNow);
  return newest - localNow;
}

/**
 * How often the list updates its clocks: as often as the fastest game
 * needs (`clockTickMs`), or `null` when no game has a turn timer.
 */
export function listTickMs(games: readonly GameSummary[]): number | null {
  const ticks = games
    .filter((game) => game.turnDeadline !== null)
    .map((game) => clockTickMs(game.pace));
  return ticks.length === 0 ? null : Math.min(...ticks);
}

export interface GameRowText {
  /** "Portes vs friend". */
  readonly title: string;
  /** "Your turn" or "Waiting for your friend". */
  readonly turn: string;
  /** Your points first: "3–1". */
  readonly score: string;
  /** "23 h left", or `null` when no turn timer runs. */
  readonly time: string | null;
  /** What a screen reader reads for the whole row: "Portes vs friend, your turn, 3 to 1, 23 h left". */
  readonly label: string;
}

/** The text of one row at phone time `localNow`. */
export function gameRowText(
  game: GameSummary,
  t: TFunction,
  localNow: number,
  offset: number,
): GameRowText {
  const title = t('home.online.vsFriend', { game: t(`games.${game.choice}`) });
  const turn = game.myTurn ? t('home.online.yourTurn') : t('home.online.waiting');
  const me = game.score[game.mySide];
  const friend = game.score[game.mySide === 'white' ? 'black' : 'white'];
  const score = t('home.online.score', { me, friend });
  const left = timeLeft(game, localNow, offset);
  const time =
    left === null ? null : t('home.online.timeLeft', { time: clockText(left, game.pace, t) });
  const spoken = [title, turn, t('home.online.scoreSpoken', { me, friend }), time];
  return { title, turn, score, time, label: spoken.filter((part) => part !== null).join(', ') };
}

/**
 * The active online games of the saved session, live
 * (`useSessionWatch`): it reads the session and follows sign-in and
 * sign-out; it never makes an account. A failure after a list came keeps
 * that list (`failed: true`); `retry` starts the watch again. Only a
 * sign-out forgets the account note; a `null` from `ready()` shows
 * `failed` (see `useSessionWatch`).
 */
export function useMyOnlineGames(
  auth: AuthProvider,
  games: GameTransport,
  now: () => number = Date.now,
): { readonly state: MyGamesState; readonly retry: () => void } {
  const start = useCallback<StartSessionWatch<readonly GameSummary[]>>(
    (onList, onError) => games.watchMyGames({ status: 'active' }, onList, onError),
    [games],
  );
  const toLoaded = useCallback(
    (list: readonly GameSummary[]): MyGamesList => ({
      games: yourTurnFirst(list),
      offset: clockOffset(list, now()),
    }),
    [now],
  );
  return useSessionWatch(auth, start, toLoaded);
}

/**
 * The phone time, updated every `tickMs` while `running` (a list with a
 * turn timer on a screen in view), and at once when it starts running or
 * the app comes back to the front (timers run late after the background).
 * `null` never updates.
 */
export function usePhoneClock(tickMs: number | null, running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (tickMs === null || !running) return;
    const tick = () => setNow(Date.now());
    // At once too: the screen may come back into view hours later.
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, tickMs);
    const front = AppState.addEventListener('change', (next) => {
      if (next === 'active') tick();
    });
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      front.remove();
    };
  }, [tickMs, running]);
  return now;
}
