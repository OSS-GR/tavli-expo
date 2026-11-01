import { Fragment } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '../Icon';
import { CardFrame, RowDivider, useInSectionCard } from '../SectionCard';

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
 * A list of full-width radio rows in one card, with thin lines between them
 * (#356). Good for options with long labels, such as languages. The picked
 * row has a lighter fill, bold text and a brass check, so color is not the
 * only cue. In a `SectionCard` the rows join that card instead of their own.
 */
export function OptionList<T extends string>({
  label,
  options,
  value,
  onChange,
  testID,
}: OptionListProps<T>) {
  const { theme } = useUnistyles();
  const inCard = useInSectionCard();
  const rows = (
    <View testID={testID} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Fragment key={option.value}>
            {index > 0 ? <RowDivider /> : null}
            <Pressable
              testID={testID ? `${testID}-${option.value}` : undefined}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityHint={option.hint}
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [styles.row(selected), pressed && styles.pressed]}>
              <View style={styles.text}>
                <Text style={styles.label(selected)}>{option.label}</Text>
                {option.hint ? <Text style={styles.hint}>{option.hint}</Text> : null}
              </View>
              {selected ? <Icon name="check" size={20} color={theme.colors.accent} /> : null}
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );
  return inCard ? rows : <CardFrame>{rows}</CardFrame>;
}

const styles = StyleSheet.create((theme) => ({
  row: (selected: boolean) => ({
    minHeight: theme.touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    backgroundColor: selected ? theme.colors.surfaceSelected : 'transparent',
  }),
  pressed: {
    opacity: 0.7,
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
