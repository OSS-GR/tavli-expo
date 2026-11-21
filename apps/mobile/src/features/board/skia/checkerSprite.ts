/**
 * One ready image per checker look, for the web (#679).
 *
 * A full checker is about 9 shapes with gradients, and a board has up to 30
 * checkers: about 220 draw calls per redraw. Safari is slow per draw call.
 * An image is one call, and Skia batches equal images.
 *
 * The image is made once per look and pixel size (`drawAsImage`), with a
 * margin for the shadow. While it is being made the caller draws the full
 * art, so nothing is ever missing.
 */
import { drawAsImage, type SkImage } from '@shopify/react-native-skia';
import type { CheckerStyle, Shadow } from '@tavli/themes';
import { useSyncExternalStore, type ReactElement } from 'react';
import { PixelRatio } from 'react-native';

export interface Sprite {
  readonly image: SkImage;
  /** Half of the image side, in radius units (the art has a margin for the shadow). */
  readonly reach: number;
  /** The checker radius in image pixels. */
  readonly px: number;
}

export interface SpriteSpec {
  /** The checker radius in image pixels. */
  readonly px: number;
  /** The image side in pixels. */
  readonly side: number;
  /** Half of the side, in radius units. */
  readonly reach: number;
}

/** A checker this small (in points) is a unit checker that its parent scales. */
const UNIT_RADIUS = 2;

/**
 * An image made for another size still serves when it is at least this
 * share of the size asked for (drawn a little larger), and at most
 * `REUSE_MAX` times it (drawn smaller). The board changes size by a few
 * percent when a card closes or the window moves; a new image each time
 * costs a canvas and its shaders, at the moment of a roll.
 */
export const REUSE_MIN = 0.9;
export const REUSE_MAX = 2;

/** True when an image of radius `have` px may stand in for one of `want` px. */
export function servesSize(have: number, want: number): boolean {
  return have >= want * REUSE_MIN && have <= want * REUSE_MAX;
}

/**
 * The image size for a checker of radius `r` points: the checker, plus room
 * for the shadow (its offset and about 2.5 blurs), plus a 2 px edge.
 */
export function spriteSpec(shadow: Shadow, r: number, pixelRatio: number): SpriteSpec {
  const px = Math.max(8, Math.round(r * pixelRatio));
  const margin = Math.max(Math.abs(shadow.dx), Math.abs(shadow.dy)) + 2.5 * shadow.blur;
  const side = Math.ceil(2 * (1 + margin + 2 / px) * px);
  return { px, side, reach: side / 2 / px };
}

const sprites = new Map<string, Sprite | 'pending'>();
/** Every size asked for so far per look, made or on the way. */
const sizes = new Map<string, number[]>();
/** The largest image made so far per look, for unit checkers. */
const largest = new Map<string, Sprite>();
const listeners = new Set<() => void>();
let version = 0;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => version;

/** The key of a look, kept per style object and per shadow object. */
const lookKeys = new WeakMap<object, WeakMap<object, string>>();
function lookKey(style: CheckerStyle, shadow: Shadow): string {
  let byShadow = lookKeys.get(style);
  if (byShadow === undefined) {
    byShadow = new WeakMap();
    lookKeys.set(style, byShadow);
  }
  let key = byShadow.get(shadow);
  if (key === undefined) {
    key = JSON.stringify([style, shadow]);
    byShadow.set(shadow, key);
  }
  return key;
}

/** Draws the image once, keeps it, and tells every checker that waits for it. */
function makeSprite(key: string, look: string, spec: SpriteSpec, art: ReactElement): void {
  sprites.set(key, 'pending');
  drawAsImage(art, { width: spec.side, height: spec.side })
    .then((image) => {
      if (!image) return;
      const sprite: Sprite = { image, reach: spec.reach, px: spec.px };
      sprites.set(key, sprite);
      const old = largest.get(look);
      if (!old || old.px <= spec.px) largest.set(look, sprite);
      version += 1;
      listeners.forEach((listener) => listener());
    })
    .catch(() => {
      // No image: the full art stays.
    });
}

/**
 * The image for this look and size, or `null` while it is being made.
 * `art(c, px)` draws the full checker at (c, c) with radius `px`.
 * A unit checker (radius 1, scaled by its parent: a flight) takes the
 * largest image of its look, which the board's checkers made.
 */
export function useCheckerSprite(
  style: CheckerStyle,
  shadow: Shadow,
  r: number,
  art: (c: number, px: number) => ReactElement,
): Sprite | null {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  const look = lookKey(style, shadow);
  if (r <= UNIT_RADIUS) return largest.get(look) ?? null;
  const spec = spriteSpec(shadow, r, PixelRatio.get());
  // An image of a near size serves too. While it is on the way, wait for it.
  const near = sizes.get(look)?.find((px) => servesSize(px, spec.px));
  const key = `${near ?? spec.px}|${look}`;
  const known = sprites.get(key);
  if (known !== undefined) return known === 'pending' ? null : known;
  sizes.set(look, [...(sizes.get(look) ?? []), spec.px]);
  makeSprite(key, look, spec, art(spec.side / 2, spec.px));
  return null;
}
