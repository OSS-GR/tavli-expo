import type { ExpoConfig } from 'expo/config';
import Constants from 'expo-constants';

import appConfig from '../app.config';

import { convexUrl, readConvexUrl } from './convexUrl';

// A plain object, so each test can set the app config.
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: null } }));

const DEV_URL = 'https://exciting-reindeer-792.eu-west-1.convex.cloud';
const PROD_URL = 'https://superb-dog-503.eu-west-1.convex.cloud';

describe('readConvexUrl', () => {
  it('returns the URL from extra', () => {
    expect(readConvexUrl({ convexUrl: DEV_URL })).toBe(DEV_URL);
    expect(readConvexUrl({ convexUrl: `  ${PROD_URL} ` })).toBe(PROD_URL);
    expect(readConvexUrl({ convexUrl: 'http://127.0.0.1:3210' })).toBe('http://127.0.0.1:3210');
  });

  it('returns undefined when there is no usable URL', () => {
    expect(readConvexUrl(undefined)).toBeUndefined();
    expect(readConvexUrl(null)).toBeUndefined();
    expect(readConvexUrl('https://example.com')).toBeUndefined();
    expect(readConvexUrl({})).toBeUndefined();
    expect(readConvexUrl({ convexUrl: 42 })).toBeUndefined();
    expect(readConvexUrl({ convexUrl: '' })).toBeUndefined();
    expect(readConvexUrl({ convexUrl: '   ' })).toBeUndefined();
    expect(readConvexUrl({ convexUrl: 'exciting-reindeer-792' })).toBeUndefined();
    expect(readConvexUrl({ convexUrl: 'ftp://example.com' })).toBeUndefined();
    expect(readConvexUrl({ convexUrl: 'https://' })).toBeUndefined();
    expect(readConvexUrl({ convexUrl: 'https://a b.convex.cloud' })).toBeUndefined();
  });
});

describe('convexUrl', () => {
  const constants = Constants as { expoConfig: unknown };

  afterEach(() => {
    constants.expoConfig = null;
  });

  function setExtra(extra: Record<string, unknown> | undefined) {
    constants.expoConfig = { name: 'Tavlaki', slug: 'tavlaki', ...(extra ? { extra } : {}) };
  }

  it('reads extra.convexUrl from the app config', () => {
    setExtra({ convexUrl: PROD_URL });
    expect(convexUrl()).toBe(PROD_URL);
  });

  it('is undefined when the app config has no URL', () => {
    setExtra(undefined);
    expect(convexUrl()).toBeUndefined();
    constants.expoConfig = null;
    expect(convexUrl()).toBeUndefined();
  });
});

describe('app.config.ts', () => {
  const saved = {
    APP_VARIANT: process.env.APP_VARIANT,
    EXPO_PUBLIC_CONVEX_URL: process.env.EXPO_PUBLIC_CONVEX_URL,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function configFor(variant: string | undefined, envUrl?: string): ExpoConfig {
    if (variant === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = variant;
    if (envUrl === undefined) delete process.env.EXPO_PUBLIC_CONVEX_URL;
    else process.env.EXPO_PUBLIC_CONVEX_URL = envUrl;
    const base: ExpoConfig = {
      name: 'Tavlaki',
      slug: 'tavlaki',
      extra: { eas: { projectId: 'x' } },
    };
    return appConfig({
      config: base,
      projectRoot: '/app',
      staticConfigPath: null,
      packageJsonPath: null,
    });
  }

  it.each([
    [undefined, DEV_URL],
    ['development', DEV_URL],
    ['preview', PROD_URL],
    ['production', PROD_URL],
  ])('APP_VARIANT=%s uses %s', (variant, url) => {
    expect(readConvexUrl(configFor(variant).extra)).toBe(url);
  });

  it('lets EXPO_PUBLIC_CONVEX_URL win over the variant', () => {
    const own = 'https://my-own-123.eu-west-1.convex.cloud';
    expect(readConvexUrl(configFor('production', own).extra)).toBe(own);
    expect(readConvexUrl(configFor('development', ` ${own} `).extra)).toBe(own);
  });

  it('ignores an empty EXPO_PUBLIC_CONVEX_URL', () => {
    expect(readConvexUrl(configFor('preview', '').extra)).toBe(PROD_URL);
  });

  it('keeps the other extra fields', () => {
    expect(configFor('development').extra).toMatchObject({ eas: { projectId: 'x' } });
  });
});
