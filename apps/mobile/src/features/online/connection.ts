/**
 * Which server an online game id talks to, and as whom (#266).
 *
 * - A dev game of this app run (`isDevGame`, `/dev/online`) plays on the
 *   in-memory server as `onlinePlayerId`.
 * - Any other id is a game on the Convex server (`games` from
 *   `@/services`). The phone plays as the user of the saved session
 *   (`auth.ready()`). The hook makes no account: a guest is made only
 *   where the user opens online play (the invite screen, #256), so a link
 *   to a game makes no account by itself. With no saved session the game
 *   cannot be opened (`signedOut`).
 *
 * Never send the user id to analytics.
 */
import type { GameTransport } from '@tavli/contracts';
import { useEffect, useState } from 'react';

import { auth, gameTransportFor, games, onlinePlayerId } from '@/services';

import { isDevGame } from './devGameIds';

export type OnlineConnection =
  /** Loading the saved session. */
  | { readonly status: 'connecting' }
  /** Ready to open the game: its transport and the player id of this phone. */
  | { readonly status: 'ready'; readonly transport: GameTransport; readonly me: string }
  /** This build has no online server (no Convex URL). */
  | { readonly status: 'off' }
  /** Nobody is signed in on this phone. */
  | { readonly status: 'signedOut' }
  /** The saved session could not be loaded (for example no network). */
  | { readonly status: 'failed' };

type Session = { readonly me: string } | 'signedOut' | 'failed' | null;

/** The connection for the online game `gameId`. */
export function useOnlineConnection(gameId: string): OnlineConnection {
  const dev = isDevGame(gameId);
  const [session, setSession] = useState<Session>(null);

  useEffect(() => {
    if (dev || auth === undefined || games === undefined) return;
    let live = true;
    auth.ready().then(
      (user) => {
        if (live) setSession(user === null ? 'signedOut' : { me: user.id });
      },
      () => {
        if (live) setSession('failed');
      },
    );
    return () => {
      live = false;
    };
  }, [dev]);

  if (dev) {
    return { status: 'ready', transport: gameTransportFor(onlinePlayerId), me: onlinePlayerId };
  }
  if (auth === undefined || games === undefined) return { status: 'off' };
  if (session === null) return { status: 'connecting' };
  if (session === 'signedOut' || session === 'failed') return { status: session };
  return { status: 'ready', transport: games, me: session.me };
}
