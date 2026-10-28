/**
 * The `PushTokens` port on a Convex client (#285, ADR-0004).
 *
 * It calls `registerPushToken` and `removePushToken` in
 * `apps/server/convex/push.ts`. Like the other adapters, no call carries
 * a player id: the client sends the sign-in token, and the server reads
 * the caller from it (#131). `ConvexClient` from `convex/browser` fits
 * the client below; a test can pass a fake.
 */
import type { PushTokens } from '@tavli/contracts';

import { PUSH_FUNCTIONS } from './functions';
import { toTransportError } from './transport';
import type { ConvexGameClient } from './transport';

/** The Convex client call the push tokens need. `ConvexClient` has it. */
export type ConvexPushTokensClient = Pick<ConvexGameClient, 'mutation'>;

export interface ConvexPushTokensOptions {
  readonly client: ConvexPushTokensClient;
}

/** Runs a call; a server error (`GameTransportErrorData`) becomes that data. */
async function run(call: () => Promise<unknown>): Promise<void> {
  try {
    await call();
  } catch (error) {
    throw toTransportError(error);
  }
}

export function createConvexPushTokens(options: ConvexPushTokensOptions): PushTokens {
  const { client } = options;
  return {
    // Only the fields the server takes: it checks its arguments strictly.
    register: (token, platform) =>
      run(() => client.mutation(PUSH_FUNCTIONS.registerPushToken, { token, platform })),
    remove: (token) => run(() => client.mutation(PUSH_FUNCTIONS.removePushToken, { token })),
  };
}
