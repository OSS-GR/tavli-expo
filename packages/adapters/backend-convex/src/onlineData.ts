/**
 * The `OnlineData` port on a Convex client (#315, ADR-0004).
 *
 * `deleteMyData` calls `deleteMyAccount` in `apps/server/convex/account.ts`
 * (#302); `exportMyData` calls the action `exportMyData` in
 * `apps/server/convex/myData.ts` (#445). Like the other adapters, the
 * calls carry no player id: the client sends the sign-in token, and the
 * server reads the caller from it (#131). `ConvexClient` from
 * `convex/browser` fits the client below; a test can pass a fake.
 */
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';

import type { OnlineData } from '@tavli/contracts';

import { ACCOUNT_FUNCTIONS, MY_DATA_FUNCTIONS } from './functions';
import { toTransportError } from './transport';
import type { ConvexGameClient } from './transport';

/** Runs an action. `ConvexClient` has it. */
export interface ConvexActionClient {
  action<Action extends FunctionReference<'action'>>(
    action: Action,
    args: FunctionArgs<Action>,
  ): Promise<Awaited<FunctionReturnType<Action>>>;
}

/** The Convex client calls the port needs. `ConvexClient` has them. */
export type ConvexOnlineDataClient = Pick<ConvexGameClient, 'mutation'> & ConvexActionClient;

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
    async exportMyData() {
      try {
        return await client.action(MY_DATA_FUNCTIONS.exportMyData, {});
      } catch (error) {
        throw toTransportError(error);
      }
    },
  };
}
