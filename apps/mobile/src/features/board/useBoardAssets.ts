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
 * Loaded images by `themeId/key`, still packed (WebP): every image of every
 * theme is under 2 MB, so this cache keeps them all.
 */
const packed = new Map<string, SkImage>();
/** Loads in flight, so two boards never fetch the same image twice. */
const loading = new Map<string, Promise<SkImage | null>>();
/** Whether the images of every theme have started to load. */
let warmed = false;

/**
 * Unpacked copies of the images boards use now, the most recently used
 * last. Skia unpacks a packed image each time it draws it, which held a new
 * board back for most of a second after a theme change; an unpacked copy
 * draws at once. A large one takes about 8 MB, so this cache stays small:
 * the wide boards of the three themes in the board picker.
 */
const unpacked = new Map<string, SkImage>();
export const UNPACKED_CACHE_SIZE = 12;

function cacheKey(themeId: string, key: string): string {
  return `${themeId}/${key}`;
}

/** One theme image, packed, from the cache or loaded once. A failed load is not kept, so it is tried again. */
function loadImage(themeId: string, key: string): Promise<SkImage | null> {
  const id = cacheKey(themeId, key);
  const hit = packed.get(id);
  if (hit !== undefined) return Promise.resolve(hit);
  const pending = loading.get(id);
  if (pending !== undefined) return pending;
  const source = THEME_IMAGES[themeId]?.[key];
  if (source === undefined) return Promise.resolve(null);
  const load = loadData(source, (data) => Skia.Image.MakeImageFromEncoded(data))
    .catch(() => null)
    .then((image) => {
      loading.delete(id);
      if (image !== null) packed.set(id, image);
      return image;
    });
  loading.set(id, load);
  return load;
}

/**
 * Starts loading every image of every theme, once, after the first board
 * has its own. Then a theme or layout change (the board picker, turning the
 * phone) has its images at hand.
 */
function warmAllThemes(): void {
  if (warmed) return;
  warmed = true;
  for (const [themeId, sources] of Object.entries(THEME_IMAGES)) {
    for (const key of Object.keys(sources)) void loadImage(themeId, key);
  }
}

/** The unpacked copy of a loaded image (about 15 ms for a large one), or the image itself when Skia cannot unpack it. */
function unpack(image: SkImage): SkImage {
  try {
    return image.makeNonTextureImage() ?? image;
  } catch {
    return image;
  }
}

/** The image to draw for `id`: its unpacked copy, made now if needed. `undefined` until it is loaded. */
function drawable(id: string): SkImage | undefined {
  let image = unpacked.get(id);
  if (image === undefined) {
    const loadedImage = packed.get(id);
    if (loadedImage === undefined) return undefined;
    image = unpack(loadedImage);
  }
  unpacked.delete(id);
  unpacked.set(id, image);
  while (unpacked.size > UNPACKED_CACHE_SIZE) {
    const oldest = unpacked.keys().next().value;
    if (oldest === undefined) break;
    unpacked.delete(oldest);
  }
  return image;
}

/** The images for `keys` when all of them are loaded, else `null`. */
function cachedImages(themeId: string, keys: readonly string[]): BoardImages | null {
  if (keys.some((key) => !packed.has(cacheKey(themeId, key)))) return null;
  const found: Record<string, SkImage> = {};
  for (const key of keys) found[key] = drawable(cacheKey(themeId, key))!;
  return found;
}

/** Empties the image caches. For tests. */
export function clearBoardImageCache(): void {
  packed.clear();
  unpacked.clear();
  loading.clear();
  warmed = false;
}

/**
 * Loads the theme images for one layout. Until they arrive the board draws
 * with the theme's plain colors, so the first frame is never empty.
 *
 * Loaded images stay in a cache, so a board that opens again (Home, the
 * game, the board picker) or changes theme draws its images on its first
 * frame instead of popping them in a moment later.
 */
export function useBoardImages(theme: ThemeManifest, layout: BoardLayout): BoardImages {
  const keys = layoutImageKeys(theme, layout).join(',');
  const [images, setImages] = useState<BoardImages>({});
  const cached = cachedImages(theme.id, keys.split(','));
  useEffect(() => {
    const themeId = theme.id;
    const wanted = keys.split(',');
    if (wanted.every((key) => packed.has(cacheKey(themeId, key)))) {
      warmAllThemes();
      return;
    }
    let alive = true;
    void Promise.all(wanted.map((key) => loadImage(themeId, key))).then(() => {
      if (alive) {
        setImages(
          Object.fromEntries(wanted.map((key) => [key, drawable(cacheKey(themeId, key)) ?? null])),
        );
      }
      warmAllThemes();
    });
    return () => {
      alive = false;
    };
  }, [theme.id, keys]);
  return cached ?? images;
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
