/**
 * Which layout the game screen and the tutorial use (#185). The window
 * decides: a window wider than tall is landscape, and then the screen uses
 * the landscape layout with the classic wide board; an almost square one
 * (the open iPhone Duo) uses rows (#649). A portrait window uses
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

/**
 * `tall` and `classic`: portrait (#184). `landscape`: the phone lies on its
 * side (#185). `rows`: a window wider than tall but almost square, like the
 * open iPhone Duo (#649): the portrait top row (menu, seats, score) above
 * the deep board (#659), with the round buttons on a rail on the right.
 */
export type ScreenLayout = BoardLayoutMode | 'landscape' | 'rows';

/**
 * The board a screen draws: the Board layout setting (`tall`, `classic`),
 * `wide`, the classic board 10% longer, for a phone on its side (#611), or
 * `deep`, the classic board made deeper, for the open iPhone Duo (#659).
 */
export type BoardShape = BoardLayoutMode | 'wide' | 'deep';

export interface WindowSize {
  readonly width: number;
  readonly height: number;
}

/** True when the window is wider than tall. */
export function isLandscapeWindow(window: WindowSize): boolean {
  return window.width > window.height;
}

/**
 * Under this width-to-height ratio a landscape window uses `rows` (#649).
 * A phone on its side is about 2.2 : 1 (an iPhone SE 1.78 : 1) and keeps
 * the rails; the open iPhone Duo is 1.42 : 1, where rails leave the board
 * short with empty space above and below it.
 */
export const ROWS_MAX_RATIO = 1.6;

/** The screen layout for a window and the Board layout setting. */
export function screenLayoutFor(window: WindowSize, mode: BoardLayoutMode): ScreenLayout {
  if (!isLandscapeWindow(window)) return mode;
  return window.width / window.height < ROWS_MAX_RATIO ? 'rows' : 'landscape';
}

/** The board a screen layout draws: landscape the wide board (#611), rows the deep one (#659). */
export function boardModeOf(layout: ScreenLayout): BoardShape {
  if (layout === 'landscape') return 'wide';
  return layout === 'rows' ? 'deep' : layout;
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
 * breaks in the middle, with a few points to spare for another font
 * (Android's Roboto, a new iOS). English: "Opponent" at 13 pt, about
 * 63 pt; 66 pt still leaves the iPhone 17 Pro board its full height. Greek:
 * "Υπολογιστής" (the bot) at 13 pt, about 82 pt, on the left, and
 * "Επιβεβαίωση" (Confirm) at 12 pt, about 78 pt, on the right. A new
 * language, or a longer one-word label in a rail, needs its width here.
 */
export const RAIL_WIDTHS: Readonly<Record<AppLanguage, Rails>> = {
  en: { left: 66, right: 66 },
  el: { left: 84, right: 80 },
};
/** The English rails (the slimmest). Greek ones are in `RAIL_WIDTHS.el`. */
export const EN_LEFT_RAIL = RAIL_WIDTHS.en.left;
export const EN_RIGHT_RAIL = RAIL_WIDTHS.en.right;
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

/**
 * The app language as a rail table key: a regional code such as `el-GR`
 * counts as its language, anything else as English.
 */
export function railLanguage(code: string | undefined): AppLanguage {
  const base = code?.split('-')[0]?.toLowerCase();
  return isAppLanguage(base) ? base : FALLBACK_LANGUAGE;
}

/** The layout of the game screen now. It changes when the phone turns. */
export function useScreenLayout(): ScreenLayoutInfo {
  const window = useWindowDimensions();
  const mode = useSettings((s) => s.boardLayout);
  const { i18n } = useTranslation();
  const language = railLanguage(i18n.resolvedLanguage ?? i18n.language);
  const layout = screenLayoutFor(window, mode);
  return {
    layout,
    rails: railWidths(window.fontScale, language),
    // A new language changes the rails, so the board measures again.
    spaceKey: `${spaceKeyFor(layout, window)}:${language}`,
  };
}
