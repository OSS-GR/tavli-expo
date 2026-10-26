import { Pressable, Switch, Text, View } from 'react-native';
import { StyleSheet, withUnistyles } from 'react-native-unistyles';

const ThemedSwitch = withUnistyles(Switch, (theme) => ({
  trackColor: { false: theme.colors.switchTrackOff, true: theme.colors.accent },
  thumbColor: theme.colors.switchThumb,
  ios_backgroundColor: theme.colors.switchTrackOff,
}));

interface ToggleRowProps {
  label: string;
  /** One short line under the label. It may wrap. */
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
}

/**
 * A settings row with a switch. The whole row is one tap target and one
 * accessible "switch", so screen readers read the label and the state together.
 */
export function ToggleRow({ label, hint, value, onValueChange, testID }: ToggleRowProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.text}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ThemedSwitch value={value} onValueChange={onValueChange} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    minHeight: theme.touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
    paddingVertical: theme.space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.separator,
  },
  pressed: {
    opacity: 0.7,
  },
  text: {
    flex: 1,
    gap: theme.space.xxs,
  },
  label: {
    ...theme.type.body,
    color: theme.colors.text,
  },
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
}));
