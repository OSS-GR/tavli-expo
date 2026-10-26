/**
 * Headless Skia helpers for the screenshot script (Node only, never bundled).
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  Group,
  drawOffscreen,
  getSkiaExports,
  makeOffscreenSurface,
} from '@shopify/react-native-skia/lib/commonjs/headless';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/commonjs/web/LoadSkiaWeb';
import type { SkFont, SkImage } from '@shopify/react-native-skia';
import { imageFileName, pickScale, type ThemeManifest } from '@tavli/themes';
import type { ReactElement } from 'react';

import type { BoardImages } from '@/features/board/skia/BoardScene';

const APP = path.resolve(__dirname, '../..');
const THEMES = path.resolve(APP, '../../packages/themes');
export const OUT = path.join(APP, 'docs/screenshots');

/** A bold sans font found on most Linux machines. Without one, badges have no number. */
const FONT_FILES = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
];

export async function loadSkia() {
  await LoadSkiaWeb();
  return getSkiaExports().Skia;
}

/** Every image of a theme, decoded from the files on disk. */
export function loadThemeImages(theme: ThemeManifest, scale: number): BoardImages {
  const { Skia } = getSkiaExports();
  const out: Record<string, SkImage | null> = {};
  for (const [key, asset] of Object.entries(theme.images)) {
    const file = path.join(THEMES, theme.id, imageFileName(asset, pickScale(asset, scale)));
    const data = Skia.Data.fromBytes(new Uint8Array(fs.readFileSync(file)));
    out[key] = Skia.Image.MakeImageFromEncoded(data);
  }
  return out;
}

export function loadFont(size: number): SkFont | null {
  const { Skia } = getSkiaExports();
  const file = FONT_FILES.find((f) => fs.existsSync(f));
  if (file === undefined) return null;
  const data = Skia.Data.fromBytes(new Uint8Array(fs.readFileSync(file)));
  const face = Skia.Typeface.MakeFreeTypeFaceFromData(data);
  return face ? Skia.Font(face, size) : null;
}

/** Draws `element` on a `width` x `height` canvas at `scale` and writes a PNG. */
export async function writePng(
  name: string,
  width: number,
  height: number,
  scale: number,
  element: ReactElement,
): Promise<{ file: string; bytes: number }> {
  const surface = makeOffscreenSurface(Math.round(width * scale), Math.round(height * scale));
  const image = await drawOffscreen(surface, <Group transform={[{ scale }]}>{element}</Group>);
  const bytes = Buffer.from(image.encodeToBase64(), 'base64');
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  fs.writeFileSync(file, bytes);
  return { file, bytes: bytes.length };
}
