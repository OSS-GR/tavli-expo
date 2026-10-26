/**
 * Loads what the Skia board needs from a theme: its images and the badge font.
 */
import { Skia, loadData, matchFont, type SkFont, type SkImage } from '@shopify/react-native-skia';
import type { BoardLayout, ThemeManifest } from '@tavli/themes';
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import type { BoardImages } from './skia/BoardScene';
import { THEME_IMAGES } from './themeImages';

/** The image keys one layout draws: its layers and the two point woods. */
export function layoutImageKeys(theme: ThemeManifest, layout: BoardLayout): string[] {
  const keys = [
    ...layout.layers.map((l) => l.image),
    theme.points.dark.texture,
    theme.points.light.texture,
  ];
  return [...new Set(keys)];
}

/**
 * Loads the theme images for one layout. Until they arrive the board draws
 * with the theme's plain colors, so the first frame is never empty.
 */
export function useBoardImages(theme: ThemeManifest, layout: BoardLayout): BoardImages {
  const [images, setImages] = useState<BoardImages>({});
  const keys = layoutImageKeys(theme, layout).join(',');
  useEffect(() => {
    let alive = true;
    const sources = THEME_IMAGES[theme.id] ?? {};
    const wanted = keys.split(',');
    void Promise.all(
      wanted.map(async (key): Promise<[string, SkImage | null]> => {
        const source = sources[key];
        if (source === undefined) return [key, null];
        const image = await loadData(source, (data) => Skia.Image.MakeImageFromEncoded(data));
        return [key, image];
      }),
    ).then((entries) => {
      if (alive) setImages(Object.fromEntries(entries));
    });
    return () => {
      alive = false;
    };
  }, [theme.id, keys]);
  return images;
}

/** A bold system font for numbers drawn on the board (count badges). */
export function useNumberFont(size: number): SkFont | null {
  const rounded = Math.max(6, Math.round(size));
  return useMemo(() => {
    try {
      return matchFont({
        fontFamily: Platform.select({ ios: 'Helvetica Neue', default: 'sans-serif' }),
        fontSize: rounded,
        fontWeight: 'bold',
      });
    } catch {
      return null;
    }
  }, [rounded]);
}
