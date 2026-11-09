/**
 * The `Safety` port on a Convex client (#320, ADR-0004): block and
 * report.
 *
 * It calls `blockPlayer`, `unblockPlayer`, `listMyBlocks` and
 * `reportPlayer` in `apps/server/convex/safety.ts`. Like the other
 * adapters, no call carries the caller's id: the client sends the
 * sign-in token, and the server reads the caller from it (#131).
 * `ConvexClient` from `convex/browser` fits the client below; a test can
 * pass a fake.
 */
import { isSafetyErrorData } from '@tavli/contracts';
import type { Safety } from '@tavli/contracts';

import { SAFETY_FUNCTIONS } from './functions';
import type { ConvexInvitesClient } from './invites';
import { isConvexError } from './transport';

/** The Convex client calls block and report need. `ConvexClient` has both. */
export type ConvexSafetyClient = Pick<ConvexInvitesClient, 'query' | 'mutation'>;

export interface ConvexSafetyOptions {
  readonly client: ConvexSafetyClient;
}

/**
 * A server error (`ConvexError` with `SafetyErrorData`) becomes that
 * data, as plain JSON. Any other error (the network) stays as it is.
 */
export function toSafetyError(error: unknown): unknown {
  if (isConvexError(error) && isSafetyErrorData(error.data)) {
    return { code: error.data.code, message: error.data.message };
  }
  return error;
}

async function run<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw toSafetyError(error);
  }
}

export function createConvexSafety(options: ConvexSafetyOptions): Safety {
  const { client } = options;
  return {
    block: async (playerId) => {
      await run(() => client.mutation(SAFETY_FUNCTIONS.blockPlayer, { playerId }));
    },
    unblock: async (playerId) => {
      await run(() => client.mutation(SAFETY_FUNCTIONS.unblockPlayer, { playerId }));
    },
    listBlocked: () => run(() => client.query(SAFETY_FUNCTIONS.listMyBlocks, {})),
    report: async ({ playerId, reason }) => {
      await run(() => client.mutation(SAFETY_FUNCTIONS.reportPlayer, { playerId, reason }));
    },
  };
}
