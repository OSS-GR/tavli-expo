/**
 * The `AppUpdates` port on a Convex client (#390, ADR-0004).
 *
 * It runs `updatePolicy` in `apps/server/convex/appUpdate.ts` once. The
 * query needs no sign-in: an old build may have no session. It sends the
 * phone system only. `ConvexClient` from `convex/browser` fits the client
 * below; a test can pass a fake.
 */
import type { AppUpdatePolicy, AppUpdates } from '@tavli/contracts';

import { APP_UPDATE_FUNCTIONS } from './functions';
import type { ConvexGameClient } from './transport';

/** The Convex client call the policy needs. `ConvexClient` has it. */
export type ConvexAppUpdatesClient = Pick<ConvexGameClient, 'query'>;

export interface ConvexAppUpdatesOptions {
  readonly client: ConvexAppUpdatesClient;
}

export function createConvexAppUpdates(options: ConvexAppUpdatesOptions): AppUpdates {
  const { client } = options;
  return {
    async updatePolicy(platform): Promise<AppUpdatePolicy> {
      const policy = await client.query(APP_UPDATE_FUNCTIONS.updatePolicy, { platform });
      // A copy with only the port's fields.
      return { minBuild: policy.minBuild, force: policy.force, updateUrl: policy.updateUrl };
    },
  };
}
