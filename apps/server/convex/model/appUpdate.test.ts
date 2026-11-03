import { describe, expect, it } from 'vitest';

import { appUpdatePolicy } from './appUpdate';

describe('appUpdatePolicy', () => {
  it('blocks no build with no env vars', () => {
    expect(appUpdatePolicy({}, 'ios')).toEqual({ minBuild: null, force: false, updateUrl: null });
    expect(appUpdatePolicy({}, 'android')).toEqual({
      minBuild: null,
      force: false,
      updateUrl: null,
    });
  });

  it('reads the lowest build and the link of each phone system', () => {
    const env = {
      MIN_APP_BUILD_IOS: '13',
      MIN_APP_BUILD_ANDROID: ' 7 ',
      APP_UPDATE_URL_IOS: 'https://apps.apple.com/app/id6828172932',
      APP_UPDATE_URL_ANDROID: '',
    };
    expect(appUpdatePolicy(env, 'ios')).toEqual({
      minBuild: 13,
      force: false,
      updateUrl: 'https://apps.apple.com/app/id6828172932',
    });
    expect(appUpdatePolicy(env, 'android')).toEqual({
      minBuild: 7,
      force: false,
      updateUrl: null,
    });
  });

  it.each(['', '0', '-3', '12.5', '1e3', 'thirteen', '13 builds', '9999999999'])(
    'blocks no build for MIN_APP_BUILD_IOS=%j',
    (value) => {
      expect(appUpdatePolicy({ MIN_APP_BUILD_IOS: value }, 'ios').minBuild).toBeNull();
    },
  );

  it.each([
    ['true', true],
    ['TRUE', true],
    [' 1 ', true],
    ['false', false],
    ['0', false],
    ['yes', false],
    ['', false],
  ])('reads FORCE_APP_UPDATE=%j as %s', (value, force) => {
    expect(appUpdatePolicy({ FORCE_APP_UPDATE: value }, 'android').force).toBe(force);
  });
});
