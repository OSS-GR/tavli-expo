import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** A disabled option shows a dashed outline and cannot be picked. */
  disabled?: boolean;
  /** Read by screen readers, for example "Coming soon". */
  accessibilityHint?: string;
}

interface SegmentedControlProps<T extends string> {
  /** Names the group for screen readers. */
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}

/**
 * A row of equal segments. The selected one has a thick brass outline and
 * bold text, so color is not the only cue. Labels may wrap.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  testID,
}: SegmentedControlProps<T>) {
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={styles.group}>
      {options.map((option) => {
        const selected = option.value === value;
        const disabled = option.disabled === true;
        return (
          <Pressable
            key={option.value}
            testID={testID ? `${testID}-${option.value}` : undefined}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityHint={option.accessibilityHint}
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment(selected, disabled),
              pressed && !disabled && styles.pressed,
            ]}>
            <Text style={styles.label(selected, disabled)}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  group: {
    flexDirection: 'row',
    gap: theme.space.xs,
    padding: theme.space.xs,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  segment: (selected: boolean, disabled: boolean) => ({
    flex: 1,
    minHeight: theme.touch.minTarget + theme.space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radii.md,
    borderWidth: 2,
    borderStyle: disabled ? 'dashed' : 'solid',
    borderColor: selected ? theme.colors.accent : disabled ? theme.colors.border : 'transparent',
    backgroundColor: selected ? theme.colors.surfaceSelected : 'transparent',
  }),
  pressed: {
    opacity: 0.7,
  },
  label: (selected: boolean, disabled: boolean) => ({
    ...(selected ? theme.type.bodyStrong : theme.type.body),
    textAlign: 'center',
    color: disabled
      ? theme.colors.textDisabled
      : selected
        ? theme.colors.text
        : theme.colors.textDim,
  }),
}));
