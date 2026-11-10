/**
 * The `Ratings` port on a Convex client (#407, ADR-0008): the caller's
 * rating, the friends board, the global board and "Show me on the global
 * board".
 *
 * It calls the functions in `apps/server/convex/ratings.ts`. Like the
 * other adapters, no call carries the caller's id: the client sends the
 * sign-in token, and the server reads the caller from it (#131).
 * `ConvexClient` from `convex/browser` fits the client below; a test can
 * pass a fake.
 */
import { isRatingsErrorData } from '@tavli/contracts';
import type { Ratings } from '@tavli/contracts';

import { RATING_FUNCTIONS } from './functions';
import type { ConvexInvitesClient } from './invites';
import { isConvexError } from './transport';

/** The Convex client calls ratings need. `ConvexClient` has both. */
export type ConvexRatingsClient = Pick<ConvexInvitesClient, 'query' | 'mutation'>;

export interface ConvexRatingsOptions {
  readonly client: ConvexRatingsClient;
}

/**
 * A server error (`ConvexError` with `RatingsErrorData`) becomes that
 * data, as plain JSON. Any other error (the network) stays as it is.
 */
export function toRatingsError(error: unknown): unknown {
  if (isConvexError(error) && isRatingsErrorData(error.data)) {
    return { code: error.data.code, message: error.data.message };
  }
  return error;
}

async function run<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw toRatingsError(error);
  }
}

export function createConvexRatings(options: ConvexRatingsOptions): Ratings {
  const { client } = options;
  const fn = RATING_FUNCTIONS;
  return {
    mine: () => run(() => client.query(fn.myRating, {})),
    friendsBoard: () => run(() => client.query(fn.friendsBoard, {})),
    globalBoard: () => run(() => client.query(fn.globalBoard, {})),
    setShown: async (shown) => {
      await run(() => client.mutation(fn.setShowOnBoard, { shown }));
    },
  };
}
