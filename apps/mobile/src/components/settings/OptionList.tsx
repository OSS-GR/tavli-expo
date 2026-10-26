import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export interface ListOption<T extends string> {
  value: T;
  label: string;
  /** One short line under the label. It may wrap. */
  hint?: string;
}

interface OptionListProps<T extends string> {
  /** Names the group for screen readers. */
  label: string;
  options: readonly ListOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}

/**
 * A list of full-width radio rows. Good for options with long labels, such as
 * languages. The radio dot and a brass outline mark the selected row.
 */
export function OptionList<T extends string>({
  label,
  options,
  value,
  onChange,
  testID,
}: OptionListProps<T>) {
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={styles.list}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={testID ? `${testID}-${option.value}` : undefined}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityHint={option.hint}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.row(selected), pressed && styles.pressed]}>
            <View style={styles.radio(selected)}>
              {selected ? <View style={styles.dot} /> : null}
            </View>
            <View style={styles.text}>
              <Text style={styles.label(selected)}>{option.label}</Text>
              {option.hint ? <Text style={styles.hint}>{option.hint}</Text> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const RADIO = 22;

const styles = StyleSheet.create((theme) => ({
  list: {
    gap: theme.space.sm,
  },
  row: (selected: boolean) => ({
    minHeight: theme.touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    borderRadius: theme.radii.lg,
    borderWidth: 2,
    borderColor: selected ? theme.colors.accent : theme.colors.border,
    backgroundColor: selected ? theme.colors.surfaceSelected : theme.colors.surface,
  }),
  pressed: {
    opacity: 0.7,
  },
  radio: (selected: boolean) => ({
    width: RADIO,
    height: RADIO,
    borderRadius: RADIO / 2,
    borderWidth: 2,
    borderColor: selected ? theme.colors.accent : theme.colors.textDim,
    alignItems: 'center',
    justifyContent: 'center',
  }),
  dot: {
    width: RADIO / 2,
    height: RADIO / 2,
    borderRadius: RADIO / 4,
    backgroundColor: theme.colors.accent,
  },
  text: {
    flex: 1,
    gap: theme.space.xxs,
  },
  label: (selected: boolean) => ({
    ...(selected ? theme.type.bodyStrong : theme.type.body),
    color: theme.colors.text,
  }),
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
}));
