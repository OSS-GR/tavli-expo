/**
 * Which layout the game screen and the tutorial use (#185). The window
 * decides: a window wider than tall is landscape, and then the screen uses
 * the landscape layout with the classic wide board. A portrait window uses
 * the layout from Settings → Board → Board layout (#184).
 *
 * Only the game screen and the tutorial turn with the phone; the other
 * screens stay portrait (`orientation` in `src/app/_layout.tsx`).
 */
import { useWindowDimensions } from 'react-native';

import type { BoardLayoutMode } from '@/features/settings/settings';
import { useSettings } from '@/features/settings/store';

/** `tall` and `classic`: portrait (#184). `landscape`: the phone lies on its side (#185). */
export type ScreenLayout = BoardLayoutMode | 'landscape';

export interface WindowSize {
  readonly width: number;
  readonly height: number;
}

/** True when the window is wider than tall. */
export function isLandscapeWindow(window: WindowSize): boolean {
  return window.width > window.height;
}

/** The screen layout for a window and the Board layout setting. */
export function screenLayoutFor(window: WindowSize, mode: BoardLayoutMode): ScreenLayout {
  return isLandscapeWindow(window) ? 'landscape' : mode;
}

/** The board a screen layout draws: landscape uses the classic wide board. */
export function boardModeOf(layout: ScreenLayout): BoardLayoutMode {
  return layout === 'landscape' ? 'classic' : layout;
}

/**
 * The two rails in landscape (#185, Figma "18 Game · Portrait and
 * landscape"), in points at the normal font size. The left rail holds what
 * the portrait top row holds (the menu, the two seats and the score); the
 * right rail the round buttons (Undo, Roll or Confirm, the hint) under the
 * right thumb. The board gets the rest of the width. The longest seat name
 * is Greek "Υπολογιστής" (the bot), about 80 pt at 13 pt; the longest
 * button label is Greek "Επιβεβαίωση" (Confirm), about 75 pt at 12 pt.
 */
export const LEFT_RAIL = 84;
export const RIGHT_RAIL = 84;
/** With a large font the rails grow up to this factor; the board gets smaller. */
const MAX_RAIL_GROWTH = 1.35;

export interface Rails {
  readonly left: number;
  readonly right: number;
}

/** The rail widths for a system font scale. */
export function railWidths(fontScale: number): Rails {
  const growth = Math.min(MAX_RAIL_GROWTH, Math.max(1, fontScale));
  return { left: Math.round(LEFT_RAIL * growth), right: Math.round(RIGHT_RAIL * growth) };
}

export interface ScreenLayoutInfo {
  readonly layout: ScreenLayout;
  /** The rail widths in landscape (see `railWidths`). */
  readonly rails: Rails;
  /**
   * Names the board's space: it changes when the phone turns or the window
   * (or the font size) changes. The board measures again for a new key.
   */
  readonly spaceKey: string;
}

/** The key of the board's space for a layout and a window (see `ScreenLayoutInfo`). */
export function spaceKeyFor(
  layout: ScreenLayout,
  window: WindowSize & { readonly fontScale?: number },
): string {
  return `${layout}:${window.width}x${window.height}@${window.fontScale ?? 1}`;
}

/** The layout of the game screen now. It changes when the phone turns. */
export function useScreenLayout(): ScreenLayoutInfo {
  const window = useWindowDimensions();
  const mode = useSettings((s) => s.boardLayout);
  const layout = screenLayoutFor(window, mode);
  return {
    layout,
    rails: railWidths(window.fontScale),
    spaceKey: spaceKeyFor(layout, window),
  };
}
