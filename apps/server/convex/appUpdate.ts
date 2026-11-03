/**
 * "Update needed" (#390): the lowest app build this deployment works with.
 *
 * The owner sets env vars on the deployment (`npx convex env set`, or the
 * Convex dashboard), with no deploy: `MIN_APP_BUILD_IOS`,
 * `MIN_APP_BUILD_ANDROID`, `FORCE_APP_UPDATE`, `APP_UPDATE_URL_IOS` and
 * `APP_UPDATE_URL_ANDROID` (see `model/appUpdate.ts`). The app asks with
 * its phone system and compares its own build on the phone.
 *
 * `updatePolicy` is the one public function that does not call
 * `signedInPlayer` (`caller.ts`): an old build may have no session, and
 * it must still learn that it is too old. That is safe because it takes
 * no player id, reads no table and returns nothing about players: only
 * the env vars above, which the app shows anyway.
 */

import { v } from 'convex/values';

import { query } from './_generated/server';
import { appUpdatePolicy } from './model/appUpdate';

/** The phone system of the build. */
const appPlatform = v.union(v.literal('ios'), v.literal('android'));

export const updatePolicy = query({
  args: { platform: appPlatform },
  returns: v.object({
    minBuild: v.union(v.number(), v.null()),
    force: v.boolean(),
    updateUrl: v.union(v.string(), v.null()),
  }),
  handler: (_ctx, { platform }) => appUpdatePolicy(process.env, platform),
});
