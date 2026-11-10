// Friends (#406): the app never reads the contacts and has no camera.
// A friend link goes out through the share sheet or the Messages app,
// where the system picks the person; a friend scans the QR code with the
// phone's own camera. So the app config must never ask for either: no
// `NSContactsUsageDescription` or `NSCameraUsageDescription` on iOS, no
// `READ_CONTACTS`, `WRITE_CONTACTS` or `CAMERA` on Android, and the app
// does not depend on expo-contacts or expo-camera.

import fs from 'node:fs';
import path from 'node:path';

import type { ExpoConfig } from 'expo/config';

import appConfig from '../app.config';

const APP_DIR = path.join(__dirname, '..');

const CONTACTS_PERMISSIONS = [
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',
] as const;

/** `app.config.ts` on the real `app.json`, as a build of `variant` sees it. */
function variantConfig(variant: string): ExpoConfig {
  const saved = process.env.APP_VARIANT;
  process.env.APP_VARIANT = variant;
  try {
    const { expo } = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'app.json'), 'utf8')) as {
      expo: ExpoConfig;
    };
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

/** The plugin entry of `name`, with its options, or `undefined`. */
function pluginOf(config: ExpoConfig, name: string): unknown[] | undefined {
  for (const plugin of config.plugins ?? []) {
    const entry: unknown[] = Array.isArray(plugin) ? plugin : [plugin];
    if (entry[0] === name) return entry;
  }
  return undefined;
}

describe('the app', () => {
  it('does not depend on expo-contacts or expo-camera', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(names).not.toContain('expo-contacts');
    expect(names).not.toContain('expo-camera');
  });
});

describe.each(['development', 'preview', 'production'])('the %s app config', (variant) => {
  const config = variantConfig(variant);

  it('has no contacts usage text on iOS', () => {
    expect(JSON.stringify(config.ios ?? {})).not.toContain('NSContactsUsageDescription');
    const contacts = pluginOf(config, 'expo-contacts');
    // The plugin writes the usage text from its `contactsPermission` option.
    expect(JSON.stringify(contacts?.[1] ?? {})).not.toContain('contactsPermission');
  });

  it('has no camera usage text and no camera permission', () => {
    expect(JSON.stringify(config.ios ?? {})).not.toContain('NSCameraUsageDescription');
    expect(pluginOf(config, 'expo-camera')).toBeUndefined();
    expect(config.android?.permissions ?? []).not.toContain('android.permission.CAMERA');
    expect(config.android?.permissions ?? []).not.toContain('CAMERA');
  });

  it('asks for no contacts permission on Android', () => {
    for (const permission of CONTACTS_PERMISSIONS) {
      expect(config.android?.permissions ?? []).not.toContain(permission);
      expect(config.android?.permissions ?? []).not.toContain(permission.split('.').at(-1));
    }
    // The expo-contacts plugin adds both at prebuild: then they must be blocked.
    if (pluginOf(config, 'expo-contacts') !== undefined) {
      expect(config.android?.blockedPermissions ?? []).toEqual(
        expect.arrayContaining([...CONTACTS_PERMISSIONS]),
      );
    }
  });
});
