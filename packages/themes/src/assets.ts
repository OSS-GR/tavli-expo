/**
 * Asset file names: image scales and sound takes.
 *
 * Image file names follow the React Native convention, so Metro can pick the
 * right scale by itself: `board.webp` (@1x), `board@2x.webp`, `board@3x.webp`.
 */

import type { ImageAsset, Scale, SoundKey, ThemeManifest } from './types';

/** The takes of one sound, as a list. Empty when the theme has no sound for `key`. */
export function soundFiles(theme: Pick<ThemeManifest, 'sounds'>, key: SoundKey): string[] {
  const v = theme.sounds[key];
  if (v === null || v === undefined) return [];
  return typeof v === 'string' ? [v] : [...v];
}

/** Every sound file of a theme, once each, in manifest order. */
export function allSoundFiles(theme: Pick<ThemeManifest, 'sounds'>): string[] {
  const out = new Set<string>();
  for (const key of Object.keys(theme.sounds) as SoundKey[]) {
    for (const f of soundFiles(theme, key)) out.add(f);
  }
  return [...out];
}

/** The file name of one scale of an image, relative to the theme folder. */
export function imageFileName(asset: ImageAsset, scale: Scale): string {
  if (scale === 1) return asset.file;
  const dot = asset.file.lastIndexOf('.');
  return `${asset.file.slice(0, dot)}@${scale}x${asset.file.slice(dot)}`;
}

/** Every file of an image, one per listed scale. */
export function imageFileNames(asset: ImageAsset): string[] {
  return asset.scales.map((s) => imageFileName(asset, s));
}

/**
 * The smallest listed scale that is at least `pixelRatio`,
 * or the largest scale if none is big enough.
 */
export function pickScale(asset: ImageAsset, pixelRatio: number): Scale {
  const sorted = [...asset.scales].sort((a, b) => a - b);
  const largest = sorted[sorted.length - 1];
  if (largest === undefined) throw new Error(`Image ${asset.file} lists no scales`);
  return sorted.find((s) => s >= pixelRatio) ?? largest;
}
