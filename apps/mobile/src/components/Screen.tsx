/**
 * The page under a screen in the Home style (#356): lit from the top, as by
 * a kafeneio lamp, and fading to a dark floor (#496, the Figma polish pass).
 *
 * `Screen` pads the top safe area, so a `ScreenHeader` inside it sits below
 * the status bar. The bottom safe area is the screen's own job (usually the
 * bottom padding of its scroll content), because only the screen knows what
 * sits at the bottom. See "Shared screen parts" in
 * `docs/architecture/app-shell.md`.
 */
import type { UiColors } from '@tavli/ui';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/**
 * The gradient as a style, for a screen whose root must be another view
 * (a `ScrollView` or a `KeyboardAvoidingView`). Spread it into that style.
 */
export function screenBackground(colors: UiColors) {
  return {
    backgroundColor: colors.background,
    backgroundImage: `linear-gradient(180deg, ${colors.backgroundLamp} 0%, ${colors.background} 38%, ${colors.backgroundFloor} 100%)`,
  };
}

export interface ScreenProps {
  children: ReactNode;
  testID?: string;
}

export function Screen({ children, testID }: ScreenProps) {
  return (
    <View testID={testID} style={styles.screen}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    paddingTop: rt.insets.top,
    ...screenBackground(theme.colors),
  },
}));
