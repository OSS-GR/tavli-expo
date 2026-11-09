/**
 * The `Usernames` port on a Convex client (#405, ADR-0004).
 *
 * It calls `getMyUsername` and `setMyUsername` in
 * `apps/server/convex/usernames.ts`. Like the other adapters, no call
 * carries a player id: the client sends the sign-in token, and the server
 * reads the caller from it (#131). `ConvexClient` from `convex/browser`
 * fits the client below; a test can pass a fake.
 */
import { isUsernameErrorData } from '@tavli/contracts';
import type { SetUsernameRequest, Usernames } from '@tavli/contracts';

import { USERNAME_FUNCTIONS } from './functions';
import type { SetUsernameArgs } from './functions';
import type { ConvexInvitesClient } from './invites';
import { isConvexError } from './transport';

/** The Convex client calls the usernames need. `ConvexClient` has both. */
export type ConvexUsernamesClient = Pick<ConvexInvitesClient, 'query' | 'mutation'>;

export interface ConvexUsernamesOptions {
  readonly client: ConvexUsernamesClient;
}

/**
 * A server error (`ConvexError` with `UsernameErrorData`) becomes that
 * data, as plain JSON. Any other error (the network) stays as it is.
 */
export function toUsernameError(error: unknown): unknown {
  if (isConvexError(error) && isUsernameErrorData(error.data)) {
    return { code: error.data.code, message: error.data.message };
  }
  return error;
}

async function run<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw toUsernameError(error);
  }
}

/** Only the fields the server takes: no `undefined` values. */
function argsOf(request: SetUsernameRequest): SetUsernameArgs {
  return {
    name: request.name,
    ...(request.acceptTerms === undefined ? {} : { acceptTerms: request.acceptTerms }),
    ...(request.ageChecked === undefined ? {} : { ageChecked: request.ageChecked }),
  };
}

export function createConvexUsernames(options: ConvexUsernamesOptions): Usernames {
  const { client } = options;
  return {
    mine: () => run(() => client.query(USERNAME_FUNCTIONS.getMyUsername, {})),
    setMine: (request) =>
      run(() => client.mutation(USERNAME_FUNCTIONS.setMyUsername, argsOf(request))),
  };
}
