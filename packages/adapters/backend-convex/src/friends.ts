/**
 * The `Friends` port on a Convex client (#406, ADR-0008): friend links,
 * username search, requests, the friends list and friend invites.
 *
 * It calls the functions in `apps/server/convex/friends.ts`. Like the
 * other adapters, no call carries the caller's id: the client sends the
 * sign-in token, and the server reads the caller from it (#131).
 * `ConvexClient` from `convex/browser` fits the client below; a test can
 * pass a fake.
 */
import { isFriendsErrorData } from '@tavli/contracts';
import type { Friends, FriendsErrorData } from '@tavli/contracts';

import { FRIEND_FUNCTIONS } from './functions';
import type { ConvexInvitesClient } from './invites';
import { isConvexError } from './transport';

/** The Convex client calls friends need. `ConvexClient` has both. */
export type ConvexFriendsClient = Pick<ConvexInvitesClient, 'query' | 'mutation'>;

export interface ConvexFriendsOptions {
  readonly client: ConvexFriendsClient;
}

/**
 * A server error (`ConvexError` with `FriendsErrorData`) becomes that
 * data, as plain JSON. Any other error (the network) stays as it is.
 */
export function toFriendsError(error: unknown): unknown {
  if (isConvexError(error) && isFriendsErrorData(error.data)) {
    return { code: error.data.code, message: error.data.message };
  }
  return error;
}

async function run<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw toFriendsError(error);
  }
}

export function createConvexFriends(options: ConvexFriendsOptions): Friends {
  const { client } = options;
  const fn = FRIEND_FUNCTIONS;
  return {
    listFriends: () => run(() => client.query(fn.listFriends, {})),
    listRequests: () => run(() => client.query(fn.listFriendRequests, {})),
    recentPlayers: () => run(() => client.query(fn.recentPlayers, {})),
    findPlayer: (username) => run(() => client.mutation(fn.findPlayer, { username })),
    myFriendLink: () => run(() => client.mutation(fn.myFriendLink, {})),
    resetFriendLink: () => run(() => client.mutation(fn.resetFriendLink, {})),
    openFriendLink: (token) => run(() => client.query(fn.openFriendLink, { token })),
    requestByLink: (token) => run(() => client.mutation(fn.requestByLink, { token })),
    requestByUsername: async (username) => {
      const result = await run(() => client.mutation(fn.requestByUsername, { username }));
      if (result.ok) return result.status;
      // The server sends a failed request as a value (the search stays counted).
      const data: unknown = { code: result.code, message: result.message };
      if (isFriendsErrorData(data)) throw data satisfies FriendsErrorData;
      throw new Error(result.message);
    },
    sendRequest: (playerId) => run(() => client.mutation(fn.sendFriendRequest, { playerId })),
    acceptRequest: async (playerId) => {
      await run(() => client.mutation(fn.acceptFriendRequest, { playerId }));
    },
    declineRequest: async (playerId) => {
      await run(() => client.mutation(fn.declineFriendRequest, { playerId }));
    },
    cancelRequest: async (playerId) => {
      await run(() => client.mutation(fn.cancelFriendRequest, { playerId }));
    },
    removeFriend: async (playerId) => {
      await run(() => client.mutation(fn.removeFriend, { playerId }));
    },
    inviteFriend: (playerId, game) =>
      run(() =>
        client.mutation(fn.inviteFriend, {
          playerId,
          choice: game.choice,
          targetPoints: game.targetPoints,
          turnTimeMinutes: game.turnTimeMinutes,
        }),
      ),
    listFriendInvites: () => run(() => client.query(fn.listFriendInvites, {})),
  };
}
