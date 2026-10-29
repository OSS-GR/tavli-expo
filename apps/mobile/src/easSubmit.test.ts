import fs from 'node:fs';
import path from 'node:path';

import type { ExpoConfig } from 'expo/config';

import appConfig from '../app.config';

const APP_DIR = path.join(__dirname, '..');

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(APP_DIR, file), 'utf8'));
}

/** `app.config.ts` on the real `app.json`, as a build of `variant` sees it. */
function variantConfig(variant: string): ExpoConfig {
  const saved = process.env.APP_VARIANT;
  process.env.APP_VARIANT = variant;
  try {
    const { expo } = readJson('app.json') as { expo: ExpoConfig };
    return appConfig({
      config: expo,
      projectRoot: APP_DIR,
      staticConfigPath: null,
      packageJsonPath: null,
    });
  } finally {
    if (saved === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = saved;
  }
}

const productionConfig = () => variantConfig('production');

interface SubmitProfile {
  ios?: { bundleIdentifier?: string; appName?: string };
}

describe('eas.json submit profile', () => {
  // `eas submit` reads app.config.ts without the build profile's env, so it
  // sees the development variant (`com.tavlaki.dev`). Then it looks for the
  // wrong App Store Connect app, and Apple refuses the upload (error 90055).
  // So the production submit profile names the store app itself.
  it('names the app that production builds are for', () => {
    const { submit } = readJson('eas.json') as { submit: { production: SubmitProfile } };
    const config = productionConfig();
    expect(submit.production.ios).toMatchObject({
      bundleIdentifier: config.ios?.bundleIdentifier,
      appName: config.name,
    });
    expect(submit.production.ios?.bundleIdentifier).toBe('com.tavlaki');
  });
});

describe('the dev client link scheme', () => {
  // The QR code of `expo start` opens `exp+<slug>`. With dev, preview and
  // production on one phone, only the dev app may register it, or iOS
  // opens the wrong app.
  const devClient = (config: ExpoConfig) =>
    (config.plugins ?? []).filter((p) => (Array.isArray(p) ? p[0] : p) === 'expo-dev-client');

  it('is registered by the development app only', () => {
    expect(devClient(variantConfig('development'))).toEqual([]);
    for (const variant of ['preview', 'production']) {
      expect(devClient(variantConfig(variant))).toEqual([
        ['expo-dev-client', { addGeneratedScheme: false }],
      ]);
    }
  });

  it('keeps the plugins of app.json', () => {
    const { expo } = readJson('app.json') as { expo: ExpoConfig };
    expect(variantConfig('production').plugins).toEqual(expect.arrayContaining(expo.plugins ?? []));
  });
});
