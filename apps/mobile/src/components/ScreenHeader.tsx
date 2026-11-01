/**
 * The top row of a screen in the Home style (#356): a round back button, a
 * centered title and a right slot. Both sides are at least 44 pt wide, so
 * the title stays centered when the right slot is empty or holds one
 * `RoundButton`.
 *
 * It adds no safe-area inset: put it inside `Screen`, which pads the top.
 * The title may wrap with a large font; it is never cut.
 */
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { RoundButton } from './RoundButton';

export interface ScreenHeaderProps {
  title: string;
  /** Goes back. Without it the left side is an empty space. */
  onBack?: () => void;
  /** What screen readers say for the back button (the screen's own back string). */
  backLabel?: string;
  /** The back button's test id. */
  testID?: string;
  /** One small control on the right, for example a `RoundButton`. */
  right?: ReactNode;
}

export function ScreenHeader({ title, onBack, backLabel, testID, right }: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.side}>
        {onBack ? (
          <RoundButton
            testID={testID}
            icon="chevronLeft"
            accessibilityLabel={backLabel ?? title}
            onPress={onBack}
          />
        ) : null}
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.side, styles.right]}>{right ?? null}</View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.sm,
  },
  side: {
    minWidth: theme.touch.minTarget,
    minHeight: theme.touch.minTarget,
    justifyContent: 'center',
  },
  right: {
    alignItems: 'flex-end',
  },
  title: {
    ...theme.type.title,
    flex: 1,
    textAlign: 'center',
    color: theme.colors.text,
  },
}));
