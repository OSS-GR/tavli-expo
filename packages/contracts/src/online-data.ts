/**
 * Delete my account (#315; Settings → Account since #402). App stores ask
 * for this in the app. This port deletes what the server keeps under the
 * player's id (a guest or a saved account). On
 * Convex it is `deleteMyAccount` (`apps/server/convex/account.ts`, #302):
 *
 * - every match still in progress is resigned: the other player wins;
 * - every open invite is deleted, so nobody can accept it;
 * - every push token is deleted, so turn notifications stop;
 * - the sign-in user is deleted, with its sessions;
 * - finished games stay for the other player. They hold the random id
 *   only, which names nobody once the user is gone.
 *
 * Like the other ports, no call takes a player id: the server reads the
 * caller from the sign-in. The Convex adapter is `createConvexOnlineData`
 * (`@tavli/backend-convex`); the in-memory server (`@tavli/online`) has
 * `onlineDataFor(playerId)`. The contract checks are `onlineDataContract`
 * in `@tavli/contracts/testing`.
 */
export interface OnlineData {
  /**
   * Deletes the signed-in user's online data (see above). Rejects with
   * `GameTransportErrorData`: `NOT_SIGNED_IN` with nobody signed in, and
   * once the data is deleted (a second call). After any other failure
   * (no network) the call may still reach the server later, so call it
   * again: `NOT_SIGNED_IN` then means the data is gone.
   */
  deleteMyData(): Promise<void>;
}
