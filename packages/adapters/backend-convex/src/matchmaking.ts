/**
 * The `Matchmaking` port on a Convex client (#531): Play ranked seeks.
 *
 * It calls the functions in `apps/server/convex/matchmaking.ts`. Like the
 * other adapters, no call carries the caller's id: the client sends the
 * sign-in token, and the server reads the caller from it (#131).
 * `ConvexClient` from `convex/browser` fits the client below; a test can
 * pass a fake.
 */
import { isMatchmakingErrorData } from '@tavli/contracts';
import type { Matchmaking, MySeek } from '@tavli/contracts';

import { MATCH_FUNCTIONS } from './functions';
import type { ConvexInvitesClient } from './invites';
import { isConvexError } from './transport';

/** The Convex client calls matchmaking needs. `ConvexClient` has them all. */
export type ConvexMatchmakingClient = Pick<ConvexInvitesClient, 'query' | 'mutation' | 'onUpdate'>;

export interface ConvexMatchmakingOptions {
  readonly client: ConvexMatchmakingClient;
}

/**
 * A server error (`ConvexError` with `MatchmakingErrorData`) becomes that
 * data, as plain JSON. Any other error (the network) stays as it is.
 */
export function toMatchmakingError(error: unknown): unknown {
  if (isConvexError(error) && isMatchmakingErrorData(error.data)) {
    return { code: error.data.code, message: error.data.message };
  }
  return error;
}

async function run<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw toMatchmakingError(error);
  }
}

/** A copy: the client may give every watcher of a query the same cached object. */
function copySeek(seek: MySeek): MySeek {
  return JSON.parse(JSON.stringify(seek)) as MySeek;
}

export function createConvexMatchmaking(options: ConvexMatchmakingOptions): Matchmaking {
  const { client } = options;
  const fn = MATCH_FUNCTIONS;
  return {
    seek: async ({ game }) => {
      await run(() => client.mutation(fn.seek, { game }));
    },
    cancel: async () => {
      await run(() => client.mutation(fn.cancelSeek, {}));
    },
    mySeek: () => run(async () => copySeek(await client.query(fn.mySeek, {}))),
    lookingCounts: () => run(() => client.query(fn.lookingCounts, {})),
    watchMySeek(onUpdate, onError) {
      let active = true;
      // Like `subscribe`: never inside the call, never after the stop function.
      const later = (deliver: () => void) => {
        void Promise.resolve().then(() => {
          if (active) deliver();
        });
      };
      // `mySeek` is a Convex query, so the client watches it: the server
      // sends a new result when the seek changes, also when a match turns
      // it `matched`.
      const stop = client.onUpdate(
        fn.mySeek,
        {},
        (seek) => {
          later(() => onUpdate(copySeek(seek)));
        },
        (error) => {
          later(() => onError?.(toMatchmakingError(error)));
        },
      );
      return () => {
        if (!active) return;
        active = false;
        stop();
      };
    },
  };
}
