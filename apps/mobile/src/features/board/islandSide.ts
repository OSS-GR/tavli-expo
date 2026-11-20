/**
 * Which side of the screen the Dynamic Island (or the notch) is on when the
 * phone lies on its side (#611).
 *
 * iOS gives the same safe inset on both sides in landscape, though the
 * island is on one side only. Knowing the side lets the game screen use
 * only a small margin on the other side, so the wide board gets that room.
 * Android gives the real inset of each side, so it needs nothing here.
 * Neither does a phone whose insets differ, such as the iPhone Duo (only its
 * right side has the camera column): then the insets are already real.
 */
import {
  addOrientationChangeListener,
  getOrientationAsync,
  Orientation,
  removeOrientationChangeListener,
} from 'expo-screen-orientation';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

export type IslandSide = 'left' | 'right';

/**
 * The island side for an interface orientation. In "landscape left" the
 * home side of the phone is on the left, so its top (the island) is on the
 * right; "landscape right" is the other way. `null` in portrait or unknown.
 */
export function islandSideOf(orientation: Orientation): IslandSide | null {
  switch (orientation) {
    case Orientation.LANDSCAPE_LEFT:
      return 'right';
    case Orientation.LANDSCAPE_RIGHT:
      return 'left';
    default:
      return null;
  }
}

/** The island side now, on iOS only. `null` when unknown: then keep both insets. */
export function useIslandSide(): IslandSide | null {
  const [orientation, setOrientation] = useState<Orientation | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let active = true;
    getOrientationAsync()
      .then((o) => {
        if (active) setOrientation(o);
      })
      .catch(() => {});
    const sub = addOrientationChangeListener((e) => {
      setOrientation(e.orientationInfo.orientation);
    });
    return () => {
      active = false;
      removeOrientationChangeListener(sub);
    };
  }, []);
  return orientation === null ? null : islandSideOf(orientation);
}

/** The margin on the side without the island, in pt: clear of the round corner's middle. */
export const OPEN_SIDE_MARGIN = 16;

/**
 * The left and right margins of a screen on its side: the safe insets, but
 * at most `OPEN_SIDE_MARGIN` on the side away from the island, and never
 * less than `least`. With the island side unknown, or with insets that
 * differ (they already name the camera's side), both insets stay.
 */
export function sideMargins(
  insets: { readonly left: number; readonly right: number },
  island: IslandSide | null,
  least: number,
): { left: number; right: number } {
  const known = insets.left === insets.right ? island : null;
  const side = (inset: number, open: boolean) =>
    Math.max(open ? Math.min(inset, OPEN_SIDE_MARGIN) : inset, least);
  return {
    left: side(insets.left, known === 'right'),
    right: side(insets.right, known === 'left'),
  };
}
