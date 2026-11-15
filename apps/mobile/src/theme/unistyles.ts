/**
 * Registers the design system themes (from @tavli/ui) with Unistyles.
 * Imported first by `index.ts`, before any `StyleSheet.create` runs.
 *
 * There is one app theme per board theme (#528): Walnut Kafeneio and Kafeneio
 * Night (dark) and Olive Inlay (light). The shown theme comes from two
 * settings: `theme` (Match the board, or one theme) and `boardTheme`.
 * `resolveThemeId` turns them into one theme id, at start (`initialTheme`)
 * and each time either setting changes. The app never follows the phone's
 * light or dark mode (owner, 2026-11-13): the player picks. The status bar
 * follows the theme's `scheme` (`app/_layout.tsx`).
 *
 * To add a theme, add it to `themes` in `packages/ui/src/themes`. It shows up
 * here and in Settings by itself.
 */
import { resolveThemeId, themes, type ThemeId } from '@tavli/ui';
import { StyleSheet, UnistylesRuntime } from 'react-native-unistyles';

import { settingsStore } from '@/features/settings/store';

export const breakpoints = {
  xs: 0,
  sm: 380,
  md: 600,
  lg: 900,
} as const;

type AppThemes = typeof themes;
type AppBreakpoints = typeof breakpoints;

declare module 'react-native-unistyles' {
  // Interface merging is how Unistyles reads our theme types.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface UnistylesThemes extends AppThemes {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

StyleSheet.configure({
  themes,
  breakpoints,
  settings: {
    // The player picks the colors: no `adaptiveThemes`, so the phone's
    // light or dark mode does not switch them.
    initialTheme: () => shownThemeId(),
  },
});

/** The theme the settings ask for now. */
function shownThemeId(): ThemeId {
  const { theme, boardTheme } = settingsStore.getState();
  return resolveThemeId(theme, boardTheme);
}

function applyRootBackground(id: ThemeId): void {
  // Avoids a flash of the wrong color behind screens and during transitions
  // (a light one under Olive Inlay, a dark one under the others).
  UnistylesRuntime.setRootViewBackgroundColor(themes[id].colors.background);
}

applyRootBackground(shownThemeId());

// Switch the theme when the player picks other app colors, or another board
// while the app colors match the board.
settingsStore.subscribe((state, previous) => {
  const next = resolveThemeId(state.theme, state.boardTheme);
  if (next !== resolveThemeId(previous.theme, previous.boardTheme)) {
    UnistylesRuntime.setTheme(next);
    applyRootBackground(next);
  }
});
