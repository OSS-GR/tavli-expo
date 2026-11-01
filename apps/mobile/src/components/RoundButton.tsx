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
  testID?: string;
}

export function RoundButton({
  icon,
  accessibilityLabel,
  accessibilityHint,
  onPress,
  testID,
}: RoundButtonProps) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Icon name={icon} size={22} color={theme.colors.text} />
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
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
}));
