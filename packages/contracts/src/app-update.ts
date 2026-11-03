/**
 * "Update needed" (#390): the lowest app build the server still works with.
 *
 * A server deploy can break older app builds (#380). The owner sets the
 * lowest build per phone system on the server, and an older build shows
 * the "Update needed" screen. On Convex the policy comes from the
 * deployment's env vars (`apps/server/convex/appUpdate.ts`), so the owner
 * changes it with no deploy.
 *
 * This is the one server call with no sign-in: an old build may have no
 * session. It sends the phone system only and gets nothing about players.
 * The app compares the build on the phone.
 *
 * The Convex adapter is `createConvexAppUpdates` (`@tavli/backend-convex`);
 * tests use `createMemoryAppUpdates`.
 */

/** The phone systems that have store builds. */
export const APP_PLATFORMS = ['ios', 'android'] as const;

export type AppPlatform = (typeof APP_PLATFORMS)[number];

/** What the server says about the builds of one phone system. Plain JSON. */
export interface AppUpdatePolicy {
  /** The lowest build that still works, or `null`: no build is blocked. */
  readonly minBuild: number | null;
  /**
   * Older builds update at once, also in the middle of an online game
   * (breaking changes). Without it they wait until the game screen closes.
   */
  readonly force: boolean;
  /** Where to update, or `null`: the app picks its default (TestFlight, Google Play). */
  readonly updateUrl: string | null;
}

/** A policy that blocks no build. */
export const NO_UPDATE_POLICY: AppUpdatePolicy = { minBuild: null, force: false, updateUrl: null };

export interface AppUpdates {
  /** The policy for `platform`. Needs no sign-in. Rejects when the server cannot be reached. */
  updatePolicy(platform: AppPlatform): Promise<AppUpdatePolicy>;
}

/** `AppUpdates` in memory, for tests: `set` changes what it answers. */
export interface MemoryAppUpdates extends AppUpdates {
  /** Answers `policy` for `platform` from now on. */
  set(platform: AppPlatform, policy: AppUpdatePolicy): void;
  /** Rejects every call (no network) until `set` or `reset`. */
  failCalls(): void;
  /** The platforms asked for, in order. */
  readonly calls: readonly AppPlatform[];
  /** Blocks no build again, and forgets the calls. */
  reset(): void;
}

export function createMemoryAppUpdates(): MemoryAppUpdates {
  const policies = new Map<AppPlatform, AppUpdatePolicy>();
  const calls: AppPlatform[] = [];
  let failing = false;
  return {
    updatePolicy(platform) {
      calls.push(platform);
      if (failing) return Promise.reject(new Error('no network'));
      return Promise.resolve(policies.get(platform) ?? NO_UPDATE_POLICY);
    },
    set(platform, policy) {
      failing = false;
      policies.set(platform, policy);
    },
    failCalls() {
      failing = true;
    },
    calls,
    reset() {
      failing = false;
      policies.clear();
      calls.length = 0;
    },
  };
}
