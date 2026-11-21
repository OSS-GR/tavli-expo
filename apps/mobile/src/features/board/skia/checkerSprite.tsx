// SPIKE (#640): one ready image per checker look. A full checker is about
// 9 draw calls with gradients; Safari is slow per draw call, and a board has
// 30 checkers. An image draws in one call and Skia batches equal images.
import { drawAsImage, type SkImage } from '@shopify/react-native-skia';
import type { CheckerStyle, Shadow } from '@tavli/themes';
import type { ReactElement } from 'react';
import { useSyncExternalStore } from 'react';
import { PixelRatio } from 'react-native';

export interface Sprite {
  image: SkImage;
  /** Half of the image side, in radius units (the art has a margin for the shadow). */
  reach: number;
  /** Radius in image pixels. */
  px: number;
}

const sprites = new Map<string, Sprite | 'pending'>();
const best = new Map<string, Sprite>();
const listeners = new Set<() => void>();
let version = 0;

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const snapshot = () => version;

const lookKeys = new WeakMap<object, string>();
function lookKey(style: CheckerStyle, shadow: Shadow): string {
  let key = lookKeys.get(style);
  if (!key) {
    key = JSON.stringify([style, shadow]);
    lookKeys.set(style, key);
  }
  return key;
}

/**
 * The image for this look and size, or null while it is being made (the
 * caller then draws the full art). `art` draws the checker at (c, c) with
 * radius `px`.
 */
export function useCheckerSprite(
  style: CheckerStyle,
  shadow: Shadow,
  r: number,
  art: (c: number, px: number) => ReactElement,
): Sprite | null {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  const look = lookKey(style, shadow);
  // A unit checker (the parent scales it): use the board's image.
  if (r <= 2) return best.get(look) ?? null;
  const px = Math.max(8, Math.round(r * PixelRatio.get()));
  const key = `${px}|${look}`;
  const known = sprites.get(key);
  if (known && known !== 'pending') return known;
  if (!known) {
    sprites.set(key, 'pending');
    const reach =
      1 + Math.max(Math.abs(shadow.dx), Math.abs(shadow.dy)) + 2.5 * shadow.blur + 2 / px;
    const side = Math.ceil(2 * reach * px);
    drawAsImage(art(side / 2, px), { width: side, height: side })
      .then((image) => {
        if (!image) return;
        const sprite = { image, reach: side / 2 / px, px };
        sprites.set(key, sprite);
        const old = best.get(look);
        if (!old || old.px <= px) best.set(look, sprite);
        version += 1;
        listeners.forEach((fn) => fn());
      })
      .catch(() => undefined);
  }
  return null;
}
