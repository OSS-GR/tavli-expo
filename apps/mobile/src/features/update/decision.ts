/**
 * "Update needed" (#390), the pure part: is this build too old for the
 * server, may the screen show now, and where does Update go.
 *
 * The server sends the lowest build it works with (`AppUpdatePolicy`);
 * the phone compares its own build here. See "Update needed" in
 * `docs/architecture/app-shell.md`.
 */
import type { AppPlatform, AppUpdatePolicy } from '@tavli/contracts';

/** This build, as the store knows it. `services.ts` reads it (`appBuild()`). */
export interface AppBuild {
  readonly platform: AppPlatform;
  /** The store build number: `CFBundleVersion` on iOS, `versionCode` on Android. */
  readonly build: number;
  /** The bundle id or package name, for the Google Play link (`com.tavlaki`). */
  readonly appId: string;
}

/** The store app id when the phone does not give one. */
const DEFAULT_APP_ID = 'com.tavlaki';

/**
 * This build from what the phone gives (`Platform.OS` and expo-application),
 * or `null` when there is no store build to compare: the web, or a build
 * number that is not a whole number. Then the app never shows the screen.
 */
export function readAppBuild(
  os: string,
  nativeBuild: string | null | undefined,
  appId: string | null | undefined,
): AppBuild | null {
  if (os !== 'ios' && os !== 'android') return null;
  const text = nativeBuild?.trim() ?? '';
  if (!/^\d{1,9}$/.test(text)) return null;
  return { platform: os, build: Number(text), appId: appId?.trim() || DEFAULT_APP_ID };
}

/**
 * What the app does with a policy:
 * - `none`: this build works (or no build is blocked);
 * - `wait`: too old, but an online game screen is open: show the screen
 *   when the player leaves it;
 * - `show`: too old: show the screen now. Nothing gets past it.
 */
export type UpdateDecision = 'none' | 'wait' | 'show';

export interface UpdateDecisionInput {
  /** This build number. */
  readonly build: number;
  /** The newest policy from the server, or `null` before the first answer. */
  readonly policy: AppUpdatePolicy | null;
  /** An online game screen is open (`useOnlineGameShowing`). */
  readonly inOnlineGame: boolean;
  /**
   * The screen shows now. It then stays, also over an online game (a push
   * tap could open one under it): only a new policy that lets this build
   * through takes it away.
   */
  readonly showing: boolean;
}

export function updateDecision({
  build,
  policy,
  inOnlineGame,
  showing,
}: UpdateDecisionInput): UpdateDecision {
  if (policy === null || policy.minBuild === null || build >= policy.minBuild) return 'none';
  if (policy.force || showing || !inOnlineGame) return 'show';
  return 'wait';
}

/** TestFlight on iOS: the TestFlight app opens on its list of apps. */
export const TESTFLIGHT_URL = 'itms-beta://';
/** The TestFlight app in the App Store, when the phone does not have it. */
export const TESTFLIGHT_STORE_URL = 'https://apps.apple.com/app/testflight/id899247664';

/**
 * Where Update goes, best first: the owner's link from the server, then
 * the default (TestFlight on iOS, the Google Play app on Android), then a
 * web link that works with no store app. The app opens the first one the
 * phone can open.
 */
export function updateLinks(policy: AppUpdatePolicy | null, build: AppBuild): string[] {
  const defaults =
    build.platform === 'ios'
      ? [TESTFLIGHT_URL, TESTFLIGHT_STORE_URL]
      : [
          `market://details?id=${build.appId}`,
          `https://play.google.com/store/apps/details?id=${build.appId}`,
        ];
  const own = policy?.updateUrl ?? null;
  return own === null ? defaults : [own, ...defaults.filter((url) => url !== own)];
}
