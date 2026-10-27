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
 * The width of each side column in landscape, in points, at the normal
 * font size. The longest label there is Greek "Επιβεβαίωση" (Confirm),
 * about 100 pt at 17 pt; a compact button around it needs about 112 pt.
 */
export const SIDE_COLUMN = 128;
/** With a large font the columns grow up to this factor; the board gets smaller. */
const MAX_COLUMN_GROWTH = 1.35;

/** The side column width for a system font scale. */
export function sideColumnWidth(fontScale: number): number {
  const growth = Math.min(MAX_COLUMN_GROWTH, Math.max(1, fontScale));
  return Math.round(SIDE_COLUMN * growth);
}

export interface ScreenLayoutInfo {
  readonly layout: ScreenLayout;
  /** The side column width in landscape (see `sideColumnWidth`). */
  readonly column: number;
}

/** The layout of the game screen now. It changes when the phone turns. */
export function useScreenLayout(): ScreenLayoutInfo {
  const window = useWindowDimensions();
  const mode = useSettings((s) => s.boardLayout);
  return {
    layout: screenLayoutFor(window, mode),
    column: sideColumnWidth(window.fontScale),
  };
}
