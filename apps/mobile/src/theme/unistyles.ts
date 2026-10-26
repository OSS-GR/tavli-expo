/**
 * Registers the design system themes (from @tavli/ui) with Unistyles.
 * Imported first by `index.ts`, before any `StyleSheet.create` runs.
 *
 * Today there is one theme, "walnut-kafeneio". To add one, add it to `themes`
 * in `packages/ui/src/themes`. It shows up here and in Settings by itself.
 * `initialTheme` reads the saved choice, so a new theme works on next launch.
 */
import { DEFAULT_THEME_ID, themes } from '@tavli/ui';
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
    // One theme for now, so the system light/dark switch does not apply.
    initialTheme: () => settingsStore.getState().theme ?? DEFAULT_THEME_ID,
  },
});

function applyRootBackground(): void {
  // Avoids a white flash behind screens and during transitions.
  UnistylesRuntime.setRootViewBackgroundColor(UnistylesRuntime.getTheme().colors.background);
}

applyRootBackground();

// Switch the theme when the user picks another one in Settings.
settingsStore.subscribe((state, previous) => {
  if (state.theme !== previous.theme) {
    UnistylesRuntime.setTheme(state.theme);
    applyRootBackground();
  }
});
