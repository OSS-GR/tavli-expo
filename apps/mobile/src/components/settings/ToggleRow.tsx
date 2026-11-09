import { Pressable, Switch, Text, View } from 'react-native';
import { StyleSheet, withUnistyles } from 'react-native-unistyles';

import type { IconName } from '../icons';
import { RowIcon, useInSectionCard } from '../SectionCard';

const ThemedSwitch = withUnistyles(Switch, (theme) => ({
  trackColor: { false: theme.colors.switchTrackOff, true: theme.colors.accent },
  thumbColor: theme.colors.switchThumb,
  ios_backgroundColor: theme.colors.switchTrackOff,
}));

interface ToggleRowProps {
  label: string;
  /** One short line under the label. It may wrap. */
  hint?: string;
  /** A Lucide icon in a small dark badge on the left. */
  icon?: IconName;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
}

/**
 * A settings row with a switch. The whole row is one tap target and one
 * accessible "switch", so screen readers read the label and the state together.
 * The switch itself takes no touches: a tap on it is the row's tap. If both
 * took it, one tap would flip the value twice (the switch, then the row), so
 * a tap on the switch would change nothing.
 * In a `SectionCard` it is a card row (side padding, the card draws the
 * lines); elsewhere it has a line under it.
 */
export function ToggleRow({ label, hint, icon, value, onValueChange, testID }: ToggleRowProps) {
  const inCard = useInSectionCard();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [styles.row(inCard), pressed && styles.pressed]}>
      {icon ? <RowIcon name={icon} /> : null}
      <View style={styles.text}>
        <Text style={styles.label(inCard)}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View
        testID={testID === undefined ? undefined : `${testID}-switch`}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <ThemedSwitch value={value} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: (inCard: boolean) => ({
    minHeight: theme.touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: inCard ? theme.space.md : theme.space.lg,
    paddingVertical: theme.space.md,
    ...(inCard
      ? { paddingHorizontal: theme.space.lg }
      : { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.separator }),
  }),
  pressed: {
    opacity: 0.7,
  },
  text: {
    flex: 1,
    gap: theme.space.xxs,
  },
  label: (inCard: boolean) => ({
    ...(inCard ? theme.type.bodyStrong : theme.type.body),
    color: theme.colors.text,
  }),
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
}));
