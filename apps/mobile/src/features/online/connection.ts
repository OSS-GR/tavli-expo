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
 * Block and report (#435) go to the same server: `safety` from
 * `@/services`, or the in-memory server's `safetyFor` for a dev game.
 *
 * Never send the user id to analytics.
 */
import type { GameTransport, Safety } from '@tavli/contracts';
import { useEffect, useState } from 'react';

import { turnPushes } from '@/features/notifications/appTurnPushes';
import { checkAppUpdate } from '@/features/update/updateCheck';
import { auth, devSafetyFor, gameTransportFor, games, onlinePlayerId, safety } from '@/services';

import { rememberOnlineAccount } from './accountHint';
import { isDevGame } from './devGameIds';

export type OnlineConnection =
  /** Loading the saved session. */
  | { readonly status: 'connecting' }
  /** Ready to open the game: its transport, block and report, and the player id of this phone. */
  | {
      readonly status: 'ready';
      readonly transport: GameTransport;
      readonly safety: Safety;
      readonly me: string;
    }
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
        if (user !== null) rememberOnlineAccount();
        // Signed in on a phone that allows pushes: the token reaches the
        // server once per app run, also when it changed while the app was
        // closed (#285). Not after the route is gone.
        if (user !== null && live) void turnPushes()?.sync();
        // Update needed (#390): this build may be too old for the server.
        if (user !== null) void checkAppUpdate();
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
    return {
      status: 'ready',
      transport: gameTransportFor(onlinePlayerId),
      safety: devSafetyFor(onlinePlayerId),
      me: onlinePlayerId,
    };
  }
  if (auth === undefined || games === undefined || safety === undefined) return { status: 'off' };
  if (session === null) return { status: 'connecting' };
  if (session === 'signedOut' || session === 'failed') return { status: session };
  return { status: 'ready', transport: games, safety, me: session.me };
}
