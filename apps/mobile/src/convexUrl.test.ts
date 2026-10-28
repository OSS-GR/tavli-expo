import fs from 'node:fs';
import path from 'node:path';

import type { ExpoConfig } from 'expo/config';
import Constants from 'expo-constants';

import appConfig from '../app.config';

import { APP_SCHEME, convexServer, convexUrl, readConvexSiteUrl, readConvexUrl } from './convexUrl';

// A plain object, so each test can set the app config.
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: null } }));

const DEV_URL = 'https://exciting-reindeer-792.eu-west-1.convex.cloud';
const PROD_URL = 'https://superb-dog-503.eu-west-1.convex.cloud';
const DEV_SITE = 'https://exciting-reindeer-792.eu-west-1.convex.site';
const PROD_SITE = 'https://superb-dog-503.eu-west-1.convex.site';

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

describe('readConvexSiteUrl', () => {
  it('returns the site URL from extra', () => {
    expect(readConvexSiteUrl({ convexSiteUrl: DEV_SITE })).toBe(DEV_SITE);
    expect(readConvexSiteUrl({ convexSiteUrl: ` ${PROD_SITE}  ` })).toBe(PROD_SITE);
    expect(readConvexSiteUrl({ convexSiteUrl: 'http://127.0.0.1:3211' })).toBe(
      'http://127.0.0.1:3211',
    );
  });

  it('returns undefined when there is no usable site URL', () => {
    expect(readConvexSiteUrl(undefined)).toBeUndefined();
    expect(readConvexSiteUrl({ convexUrl: DEV_URL })).toBeUndefined();
    expect(readConvexSiteUrl({ convexSiteUrl: 7 })).toBeUndefined();
    expect(readConvexSiteUrl({ convexSiteUrl: ' ' })).toBeUndefined();
    expect(readConvexSiteUrl({ convexSiteUrl: 'superb-dog-503.convex.site' })).toBeUndefined();
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

  it('convexServer gives both URLs', () => {
    setExtra({ convexUrl: PROD_URL, convexSiteUrl: PROD_SITE });
    expect(convexServer()).toEqual({ url: PROD_URL, siteUrl: PROD_SITE });
  });

  it('convexServer is undefined (online is off) when a URL is missing', () => {
    setExtra({ convexUrl: PROD_URL });
    expect(convexServer()).toBeUndefined();
    setExtra({ convexSiteUrl: PROD_SITE });
    expect(convexServer()).toBeUndefined();
    setExtra(undefined);
    expect(convexServer()).toBeUndefined();
    constants.expoConfig = null;
    expect(convexServer()).toBeUndefined();
  });
});

describe('app.config.ts', () => {
  const saved = {
    APP_VARIANT: process.env.APP_VARIANT,
    EXPO_PUBLIC_CONVEX_URL: process.env.EXPO_PUBLIC_CONVEX_URL,
    EXPO_PUBLIC_CONVEX_SITE_URL: process.env.EXPO_PUBLIC_CONVEX_SITE_URL,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function setEnv(key: keyof typeof saved, value: string | undefined) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  function configFor(variant: string | undefined, envUrl?: string, envSite?: string): ExpoConfig {
    setEnv('APP_VARIANT', variant);
    setEnv('EXPO_PUBLIC_CONVEX_URL', envUrl);
    setEnv('EXPO_PUBLIC_CONVEX_SITE_URL', envSite);
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

  it.each([
    [undefined, DEV_SITE],
    ['development', DEV_SITE],
    ['preview', PROD_SITE],
    ['production', PROD_SITE],
  ])('APP_VARIANT=%s signs in at %s', (variant, site) => {
    expect(readConvexSiteUrl(configFor(variant).extra)).toBe(site);
  });

  it('makes the site URL from EXPO_PUBLIC_CONVEX_URL', () => {
    const own = 'https://my-own-123.eu-west-1.convex.cloud';
    const site = 'https://my-own-123.eu-west-1.convex.site';
    expect(readConvexSiteUrl(configFor('production', own).extra)).toBe(site);
    expect(readConvexSiteUrl(configFor('development', `${own}/`).extra)).toBe(site);
  });

  it('lets EXPO_PUBLIC_CONVEX_SITE_URL win', () => {
    const site = 'https://my-own-123.eu-west-1.convex.site';
    expect(readConvexSiteUrl(configFor('production', undefined, site).extra)).toBe(site);
    expect(readConvexSiteUrl(configFor('preview', undefined, ` ${site} `).extra)).toBe(site);
    expect(readConvexSiteUrl(configFor('preview', undefined, '').extra)).toBe(PROD_SITE);
  });

  it('has no site URL for a local backend unless EXPO_PUBLIC_CONVEX_SITE_URL is set', () => {
    const local = 'http://127.0.0.1:3210';
    const extra = configFor('development', local).extra;
    expect(readConvexUrl(extra)).toBe(local);
    expect(extra).not.toHaveProperty('convexSiteUrl');
    const site = 'http://127.0.0.1:3211';
    expect(readConvexSiteUrl(configFor('development', local, site).extra)).toBe(site);
  });

  it('keeps the other extra fields', () => {
    expect(configFor('development').extra).toMatchObject({ eas: { projectId: 'x' } });
  });
});

describe('APP_SCHEME', () => {
  const read = (file: string) => fs.readFileSync(path.join(__dirname, file), 'utf8');

  it('is the scheme in app.json', () => {
    const app = JSON.parse(read('../app.json')) as { expo: { scheme?: unknown } };
    expect(app.expo.scheme).toBe(APP_SCHEME);
  });

  it('is a trusted origin of the server (apps/server/convex/auth.ts)', () => {
    expect(read('../../server/convex/auth.ts')).toContain(`'${APP_SCHEME}://'`);
  });
});
