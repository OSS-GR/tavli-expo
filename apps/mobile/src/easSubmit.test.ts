import fs from 'node:fs';
import path from 'node:path';

import type { ExpoConfig } from 'expo/config';

import appConfig from '../app.config';

const APP_DIR = path.join(__dirname, '..');

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(APP_DIR, file), 'utf8'));
}

/** `app.config.ts` on the real `app.json`, as a production build sees it. */
function productionConfig(): ExpoConfig {
  const saved = process.env.APP_VARIANT;
  process.env.APP_VARIANT = 'production';
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
