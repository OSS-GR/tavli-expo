/**
 * Delete my online data (#315). App stores ask for this in the app.
 *
 * The app shows no account: online play makes a hidden guest id when the
 * player makes or opens an invite (`account.ts`). So Settings says
 * "Delete my online data", never "account". The server call is the
 * `OnlineData` port (Convex `deleteMyAccount`, #302): it resigns the
 * games in progress, deletes the open invites, the push tokens and the
 * sign-in user, and keeps finished games with no name.
 *
 * `deleteOnlineData` runs the steps in order, through `signOutOfOnline`:
 *
 * 1. the phone's push token comes off the server (while the session
 *    still works), in the turn notifications queue;
 * 2. the delete, with a time limit: offline, the Convex client keeps a
 *    call and sends it later, so it would never answer;
 * 3. the sign-out, so the next Play a friend makes a new guest;
 * 4. the phone forgets its account note (`accountHint.ts`), so Home
 *    lists no online games and Settings hides the row.
 *
 * `NOT_SIGNED_IN` from the delete means the data is gone already (an
 * earlier call that got no answer, or a session that ran out): the steps
 * go on. Any other failure stops before the sign-out, and the player can
 * try again. Never send the user id to analytics.
 */
import { isGameTransportErrorData, type AuthProvider, type OnlineData } from '@tavli/contracts';

import { signOutOfOnline, type SignOutPushes } from './account';

/** How long the delete may take before the app says it failed. */
export const DELETE_TIME_LIMIT_MS = 20_000;

/** What `deleteOnlineData` needs. Settings gets it from the route. */
export interface OnlineDataDeps {
  readonly auth: AuthProvider;
  readonly data: OnlineData;
  /** The turn notifications, or `undefined` in a build without them. */
  readonly pushes: SignOutPushes | undefined;
}

/** The delete took too long (no network). */
export class DeleteTimedOut extends Error {
  constructor() {
    super('the delete did not answer in time');
    this.name = 'DeleteTimedOut';
  }
}

/** `call`, or a `DeleteTimedOut` after `ms`. */
function withTimeLimit(call: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeleteTimedOut()), ms);
    call.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error as Error);
      },
    );
  });
}

/** True for `NOT_SIGNED_IN`: nothing is left to delete for this sign-in. */
function alreadyGone(error: unknown): boolean {
  return isGameTransportErrorData(error) && error.code === 'NOT_SIGNED_IN';
}

/**
 * Deletes the online data of this phone's user and signs out (see the
 * top of this file). Resolves once it is all done; rejects when a step
 * failed. Then call it again.
 */
export async function deleteOnlineData(deps: OnlineDataDeps): Promise<void> {
  await signOutOfOnline(deps.auth, deps.pushes, async () => {
    try {
      await withTimeLimit(deps.data.deleteMyData(), DELETE_TIME_LIMIT_MS);
    } catch (error) {
      if (!alreadyGone(error)) throw error;
    }
  });
}
