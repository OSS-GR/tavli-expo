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
  /**
   * The screen reader name of each option. Default: its visible label.
   * Use it when two groups on one screen share an option name, so each
   * radio names its group too (for example "Opening roll: Standard").
   */
  accessibilityLabelFor?: (option: SegmentOption<T>) => string;
  /**
   * `pill` (default): a brass pill on a dark pill track. `tray`: a raised
   * wooden tile in a sunken tray, as on Play a friend in the Figma pass
   * (#516).
   */
  look?: SegmentLook;
  testID?: string;
}

export type SegmentLook = 'pill' | 'tray';

/**
 * A row of equal segments on a dark pill track (#356). The selected one is
 * a brass pill with bold text, so color is not the only cue. Each segment
 * is at least 44 pt tall, and labels may wrap.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  accessibilityLabelFor,
  look = 'pill',
  testID,
}: SegmentedControlProps<T>) {
  const tray = look === 'tray';
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.group, tray && styles.trayGroup]}>
      {options.map((option) => {
        const selected = option.value === value;
        const disabled = option.disabled === true;
        return (
          <Pressable
            key={option.value}
            testID={testID ? `${testID}-${option.value}` : undefined}
            accessibilityRole="radio"
            accessibilityLabel={accessibilityLabelFor?.(option) ?? option.label}
            accessibilityHint={option.accessibilityHint}
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment(selected, disabled),
              tray && styles.traySegment(selected),
              pressed && !disabled && styles.pressed,
            ]}>
            <Text style={[styles.label(selected, disabled), tray && styles.trayLabel(selected)]}>
              {option.label}
            </Text>
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
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.backgroundDeep,
    borderWidth: 1,
    borderColor: theme.colors.separator,
  },
  segment: (selected: boolean, disabled: boolean) => ({
    flex: 1,
    minHeight: theme.touch.minTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radii.pill,
    borderWidth: disabled ? 1 : 0,
    borderStyle: disabled ? 'dashed' : 'solid',
    borderColor: disabled ? theme.colors.border : 'transparent',
    backgroundColor: selected ? theme.colors.accent : 'transparent',
  }),
  // The tray look (#516): a sunken track and a raised wooden tile.
  trayGroup: {
    flex: 1,
    borderRadius: theme.radii.lg,
    borderWidth: 0,
    backgroundColor: theme.colors.surfaceSunken,
    boxShadow: 'inset 0px 2px 4px rgba(0, 0, 0, 0.55)',
  },
  traySegment: (selected: boolean) => ({
    borderRadius: theme.radii.md,
    borderWidth: selected ? 1 : 0,
    borderColor: selected ? theme.colors.accentLine : 'transparent',
    backgroundColor: selected ? theme.colors.surfaceSelected : 'transparent',
    boxShadow: selected
      ? `inset 0px 1px 0px ${theme.colors.border}, 0px 2px 3px rgba(0, 0, 0, 0.4)`
      : undefined,
  }),
  trayLabel: (selected: boolean) => ({
    fontSize: 16,
    lineHeight: 20,
    color: selected ? theme.colors.text : theme.colors.textDim,
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
        ? theme.colors.onAccent
        : theme.colors.textDim,
  }),
}));
