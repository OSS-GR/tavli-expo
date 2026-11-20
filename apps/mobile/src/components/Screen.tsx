/**
 * The page under a screen in the Home style (#356): lit from the top, as by
 * a kafeneio lamp, and fading to a dark floor (#496, the Figma polish pass).
 *
 * `Screen` pads the top, left and right safe areas, so a `ScreenHeader`
 * inside it sits below the status bar and clear of a camera at the side (an
 * iPhone Duo gives a right inset of 84 pt for its camera column).
 * The bottom safe area is the screen's own job (usually the
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
  /**
   * Something covers the screen (the turn notifications offer, #285):
   * screen readers skip it. `collapsable={false}` keeps its native view
   * when this changes (#173).
   */
  hidden?: boolean;
}

export function Screen({ children, testID, hidden }: ScreenProps) {
  // Only a screen that can be covered keeps its native view and sets the
  // props; the others stay a plain view.
  const cover =
    hidden === undefined
      ? {}
      : {
          collapsable: false,
          importantForAccessibility: hidden ? ('no-hide-descendants' as const) : ('auto' as const),
          accessibilityElementsHidden: hidden,
        };
  return (
    <View testID={testID} style={styles.screen} {...cover}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    paddingTop: rt.insets.top,
    paddingLeft: rt.insets.left,
    paddingRight: rt.insets.right,
    ...screenBackground(theme.colors),
  },
}));
