/**
 * The three surface heights of the Figma polish pass (#496, Components →
 * Cards). See "Shared screen parts" in `docs/architecture/app-shell.md`.
 *
 * - `sunken`: below the page, for inputs and tracks.
 * - `tray`: flat on the page, for status and lists of rows.
 * - `raised`: the one card that leads a screen (a brass hairline, a lit top
 *   edge and a deep shadow). Use at most one per screen.
 */
import type { UiColors } from '@tavli/ui';
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export type SurfaceTier = 'sunken' | 'tray' | 'raised';

interface SurfaceTheme {
  colors: UiColors;
  radii: { lg: number; xl: number; tray: number };
}

/**
 * Fill, edge, corners and shadow of one tier, for a view that draws its
 * own content (a `Pressable` card). `Surface` uses the same style.
 */
export function surfaceStyle(theme: SurfaceTheme, tier: SurfaceTier) {
  const { colors, radii } = theme;
  switch (tier) {
    case 'sunken':
      return {
        borderRadius: radii.lg,
        borderWidth: 1,
        borderColor: colors.separator,
        backgroundColor: colors.surfaceSunken,
      };
    case 'tray':
      return {
        borderRadius: radii.tray,
        backgroundColor: colors.surface,
        // A faint lit top edge, as on a wooden tray.
        boxShadow: `inset 0px 1px 0px ${colors.backgroundLamp}`,
      };
    case 'raised':
      return {
        borderRadius: radii.xl,
        borderWidth: 1,
        borderColor: colors.accentLine,
        backgroundColor: colors.surfaceRaised,
        boxShadow: `inset 0px 1px 0px ${colors.border}, 0px 12px 28px rgba(0, 0, 0, 0.45)`,
      };
  }
}

export interface SurfaceProps {
  tier: SurfaceTier;
  children?: ReactNode;
  /** Padding, gap and the like. The tier sets the fill, edge, corners and shadow. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Surface({ tier, children, style, testID }: SurfaceProps) {
  return (
    <View testID={testID} style={[styles.surface(tier), style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // An object written here, not a bare call: the Unistyles Babel plugin
  // only tags inline objects for a theme change (see `styleShapes.test.ts`).
  surface: (tier: SurfaceTier) => ({ ...surfaceStyle(theme, tier) }),
}));
