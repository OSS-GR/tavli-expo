/**
 * The `OnlineData` port on a Convex client (#315, ADR-0004).
 *
 * It calls `deleteMyAccount` in `apps/server/convex/account.ts` (#302).
 * Like the other adapters, the call carries no player id: the client
 * sends the sign-in token, and the server reads the caller from it
 * (#131). `ConvexClient` from `convex/browser` fits the client below; a
 * test can pass a fake.
 */
import type { OnlineData } from '@tavli/contracts';

import { ACCOUNT_FUNCTIONS } from './functions';
import { toTransportError } from './transport';
import type { ConvexGameClient } from './transport';

/** The Convex client call the delete needs. `ConvexClient` has it. */
export type ConvexOnlineDataClient = Pick<ConvexGameClient, 'mutation'>;

export interface ConvexOnlineDataOptions {
  readonly client: ConvexOnlineDataClient;
}

export function createConvexOnlineData(options: ConvexOnlineDataOptions): OnlineData {
  const { client } = options;
  return {
    async deleteMyData() {
      try {
        await client.mutation(ACCOUNT_FUNCTIONS.deleteMyAccount, {});
      } catch (error) {
        // A server error (`GameTransportErrorData`) becomes that data.
        throw toTransportError(error);
      }
    },
  };
}
