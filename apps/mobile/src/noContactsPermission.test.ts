// Friends (#406): the app never reads the contacts. The contact picker
// (one person, picked by the player) needs no permission, so the app
// config must never ask for one: no `NSContactsUsageDescription` on iOS,
// no `READ_CONTACTS` or `WRITE_CONTACTS` on Android.

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

describe.each(['development', 'preview', 'production'])('the %s app config', (variant) => {
  const config = variantConfig(variant);

  it('has no contacts usage text on iOS', () => {
    expect(JSON.stringify(config.ios ?? {})).not.toContain('NSContactsUsageDescription');
    const contacts = pluginOf(config, 'expo-contacts');
    // The plugin writes the usage text from its `contactsPermission` option.
    expect(JSON.stringify(contacts?.[1] ?? {})).not.toContain('contactsPermission');
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
