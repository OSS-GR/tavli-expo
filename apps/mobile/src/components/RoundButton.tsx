/**
 * A round icon button in the Home style (#356): 44 pt, surface, a thin
 * border and a Lucide icon. The back button of `ScreenHeader` is one; use
 * it for the header's right slot too. The icon only decorates, so the
 * button needs `accessibilityLabel`.
 */
import { Pressable } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from './Icon';
import type { IconName } from './icons';

export interface RoundButtonProps {
  icon: IconName;
  /** What screen readers say, for example "Back". */
  accessibilityLabel: string;
  accessibilityHint?: string;
  onPress: () => void;
  /** `small`: 36 pt (a sheet's close button), still a 44 pt hit area. Default: 44 pt. */
  size?: 'regular' | 'small';
  testID?: string;
}

/** The small button's hit area grows to 44 pt (36 + 4 + 4). */
const SMALL_HIT_SLOP = 4;

export function RoundButton({
  icon,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  size = 'regular',
  testID,
}: RoundButtonProps) {
  const small = size === 'small';
  const { theme } = useUnistyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      {...(small ? { hitSlop: SMALL_HIT_SLOP } : {})}
      style={({ pressed }) => [styles.button, small && styles.small, pressed && styles.pressed]}>
      <Icon name={icon} size={small ? 18 : 22} color={theme.colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    width: theme.touch.minTarget,
    height: theme.touch.minTarget,
    borderRadius: theme.touch.minTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  // Figma frame 09: no border, a lit top edge.
  small: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 0,
    boxShadow: `inset 0px 1px 0px ${theme.colors.edgeLight}`,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
}));
