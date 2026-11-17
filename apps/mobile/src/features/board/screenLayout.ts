/**
 * Which layout the game screen and the tutorial use (#185). The window
 * decides: a window wider than tall is landscape, and then the screen uses
 * the landscape layout with the classic wide board. A portrait window uses
 * the layout from Settings → Board → Board layout (#184).
 *
 * Only the game screen and the tutorial turn with the phone; the other
 * screens stay portrait (`orientation` in `src/app/_layout.tsx`).
 */
import { useTranslation } from 'react-i18next';
import { useWindowDimensions } from 'react-native';

import { FALLBACK_LANGUAGE, isAppLanguage, type AppLanguage } from '@/i18n/languages';

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
 * right thumb. The board gets the rest of the width.
 *
 * The rails are as slim as the longest one-word label of the language
 * allows (owner pick, 2026-11-17: a bigger board on its side): a word never
 * breaks in the middle. English: "Opponent" at 13 pt, about 63 pt. Greek:
 * "Υπολογιστής" (the bot) at 13 pt, about 82 pt, on the left, and
 * "Επιβεβαίωση" (Confirm) at 12 pt, about 78 pt, on the right. A new
 * language, or a longer one-word label in a rail, needs its width here.
 */
export const RAIL_WIDTHS: Readonly<Record<AppLanguage, Rails>> = {
  en: { left: 64, right: 64 },
  el: { left: 84, right: 80 },
};
/** The English rails: the slimmest. */
export const LEFT_RAIL = RAIL_WIDTHS.en.left;
export const RIGHT_RAIL = RAIL_WIDTHS.en.right;
/** With a large font the rails grow up to this factor; the board gets smaller. */
const MAX_RAIL_GROWTH = 1.35;

export interface Rails {
  readonly left: number;
  readonly right: number;
}

/** The rail widths for a system font scale and the app language. */
export function railWidths(fontScale: number, language: AppLanguage = FALLBACK_LANGUAGE): Rails {
  const growth = Math.min(MAX_RAIL_GROWTH, Math.max(1, fontScale));
  const base = RAIL_WIDTHS[language];
  return { left: Math.round(base.left * growth), right: Math.round(base.right * growth) };
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

/** The app language as a rail table key: English for anything else. */
function railLanguage(code: string | undefined): AppLanguage {
  return isAppLanguage(code) ? code : FALLBACK_LANGUAGE;
}

/** The layout of the game screen now. It changes when the phone turns. */
export function useScreenLayout(): ScreenLayoutInfo {
  const window = useWindowDimensions();
  const mode = useSettings((s) => s.boardLayout);
  const { i18n } = useTranslation();
  const language = railLanguage(i18n.language);
  const layout = screenLayoutFor(window, mode);
  return {
    layout,
    rails: railWidths(window.fontScale, language),
    // A new language changes the rails, so the board measures again.
    spaceKey: `${spaceKeyFor(layout, window)}:${language}`,
  };
}
