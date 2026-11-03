/**
 * The pure part of "Update needed" (#390): the update policy from the
 * deployment's env vars. No Convex types; `appUpdate.ts` holds the query.
 * See "Update needed" in `docs/architecture/online-game-service.md`.
 *
 * - `MIN_APP_BUILD_IOS`, `MIN_APP_BUILD_ANDROID`: the lowest build that
 *   still works, a whole number above 0. Missing, empty or not such a
 *   number: no build is blocked, so a typo never locks everyone out.
 * - `FORCE_APP_UPDATE`: `true` or `1` shows the screen also in the middle
 *   of an online game. Anything else is off.
 * - `APP_UPDATE_URL_IOS`, `APP_UPDATE_URL_ANDROID`: where to update.
 *   Missing or empty: the app uses its default (TestFlight on iOS, Google
 *   Play on Android).
 */

import type { AppPlatform, AppUpdatePolicy } from '@tavli/contracts';

/** The env vars of a deployment (`process.env`). */
export type Env = Readonly<Record<string, string | undefined>>;

const SUFFIX = { ios: 'IOS', android: 'ANDROID' } as const satisfies Record<AppPlatform, string>;

/** The policy for `platform` from `env`. */
export function appUpdatePolicy(env: Env, platform: AppPlatform): AppUpdatePolicy {
  const suffix = SUFFIX[platform];
  return {
    minBuild: buildNumber(env[`MIN_APP_BUILD_${suffix}`]),
    force: isOn(env['FORCE_APP_UPDATE']),
    updateUrl: text(env[`APP_UPDATE_URL_${suffix}`]),
  };
}

/** A whole number above 0, or `null`. */
function buildNumber(value: string | undefined): number | null {
  const trimmed = value?.trim() ?? '';
  if (!/^\d{1,9}$/.test(trimmed)) return null;
  const build = Number(trimmed);
  return build > 0 ? build : null;
}

function isOn(value: string | undefined): boolean {
  const trimmed = value?.trim().toLowerCase();
  return trimmed === 'true' || trimmed === '1';
}

function text(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
