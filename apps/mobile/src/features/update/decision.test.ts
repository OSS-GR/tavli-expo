// "Update needed" (#390): the pure decision, this build, and the links.
import type { AppUpdatePolicy } from '@tavli/contracts';

import {
  TESTFLIGHT_STORE_URL,
  TESTFLIGHT_URL,
  readAppBuild,
  updateDecision,
  updateLinks,
  type AppBuild,
} from './decision';

const policy = (minBuild: number | null, force = false): AppUpdatePolicy => ({
  minBuild,
  force,
  updateUrl: null,
});

const decide = (
  build: number,
  given: AppUpdatePolicy | null,
  inOnlineGame = false,
  showing = false,
) => updateDecision({ build, policy: given, inOnlineGame, showing });

describe('updateDecision', () => {
  it('shows the screen below the lowest build', () => {
    expect(decide(12, policy(13))).toBe('show');
  });

  it('lets the lowest build and newer ones through', () => {
    expect(decide(13, policy(13))).toBe('none');
    expect(decide(14, policy(13, true))).toBe('none');
  });

  it('blocks nothing with no lowest build, or before the server answers', () => {
    expect(decide(1, policy(null))).toBe('none');
    expect(decide(1, policy(null, true), true)).toBe('none');
    expect(decide(1, null)).toBe('none');
  });

  it('waits during an online game', () => {
    expect(decide(12, policy(13), true)).toBe('wait');
  });

  it('shows during an online game when the server forces it', () => {
    expect(decide(12, policy(13, true), true)).toBe('show');
    expect(decide(12, policy(13, true))).toBe('show');
  });

  it('keeps showing over an online game opened under it', () => {
    expect(decide(12, policy(13), true, true)).toBe('show');
    // Only a policy that lets the build through takes it away.
    expect(decide(12, policy(12), true, true)).toBe('none');
    expect(decide(12, policy(null), false, true)).toBe('none');
  });
});

describe('readAppBuild', () => {
  it('reads the store build number of iOS and Android', () => {
    expect(readAppBuild('ios', '13', 'com.tavlaki')).toEqual({
      platform: 'ios',
      build: 13,
      appId: 'com.tavlaki',
    });
    expect(readAppBuild('android', ' 7 ', 'com.tavlaki.dev')).toEqual({
      platform: 'android',
      build: 7,
      appId: 'com.tavlaki.dev',
    });
  });

  it('falls back to the store app id', () => {
    expect(readAppBuild('android', '7', null)?.appId).toBe('com.tavlaki');
    expect(readAppBuild('android', '7', ' ')?.appId).toBe('com.tavlaki');
  });

  it('has no build on the web, or with a build number that is not a whole number', () => {
    expect(readAppBuild('web', '13', 'com.tavlaki')).toBeNull();
    expect(readAppBuild('ios', null, 'com.tavlaki')).toBeNull();
    expect(readAppBuild('ios', '1.0.13', 'com.tavlaki')).toBeNull();
    expect(readAppBuild('ios', '', 'com.tavlaki')).toBeNull();
  });
});

describe('updateLinks', () => {
  const ios: AppBuild = { platform: 'ios', build: 12, appId: 'com.tavlaki' };
  const android: AppBuild = { platform: 'android', build: 12, appId: 'com.tavlaki' };

  it('opens TestFlight on iOS, then the TestFlight app in the App Store', () => {
    expect(updateLinks(policy(13), ios)).toEqual([TESTFLIGHT_URL, TESTFLIGHT_STORE_URL]);
  });

  it('opens Google Play for this app on Android, then its web page', () => {
    expect(updateLinks(policy(13), { ...android, appId: 'com.tavlaki.dev' })).toEqual([
      'market://details?id=com.tavlaki.dev',
      'https://play.google.com/store/apps/details?id=com.tavlaki.dev',
    ]);
  });

  it("tries the owner's link first", () => {
    const store = 'https://apps.apple.com/app/id6828172932';
    expect(updateLinks({ ...policy(13), updateUrl: store }, ios)).toEqual([
      store,
      TESTFLIGHT_URL,
      TESTFLIGHT_STORE_URL,
    ]);
    expect(updateLinks({ ...policy(13), updateUrl: TESTFLIGHT_URL }, ios)).toEqual([
      TESTFLIGHT_URL,
      TESTFLIGHT_STORE_URL,
    ]);
  });
});
