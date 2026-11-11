import fs from 'node:fs';
import path from 'node:path';

import { fonts } from '@tavli/ui';

const APP_DIR = path.join(__dirname, '..');

/** The files the expo-font config plugin embeds (`app.json`, #493). */
function embeddedFonts(): string[] {
  const { expo } = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'app.json'), 'utf8')) as {
    expo: { plugins: (string | [string, { fonts?: string[] }])[] };
  };
  const plugin = expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-font');
  return Array.isArray(plugin) ? (plugin[1].fonts ?? []) : [];
}

describe('embedded fonts', () => {
  // iOS finds a font by its PostScript name and Android by its file name, so
  // the file must be named after the family the styles use.
  it.each(Object.values(fonts))('embeds %s under its own name', (family) => {
    const file = `./assets/fonts/${family}.ttf`;
    expect(embeddedFonts()).toContain(file);
    expect(fs.existsSync(path.join(APP_DIR, file))).toBe(true);
  });

  it('keeps the font license next to the fonts', () => {
    expect(fs.existsSync(path.join(APP_DIR, 'assets/fonts/OFL.txt'))).toBe(true);
  });
});
