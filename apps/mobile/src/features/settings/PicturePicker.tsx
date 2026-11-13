/**
 * The frame of the board pickers (board, board layout, your home): a
 * label, radio rows that each have a small picture, a name and a hint, and
 * a hint for the whole group.
 *
 * - In a `SectionCard` (Settings, #360): a label row with an icon badge and
 *   the group hint, then plain card rows with thin lines, like
 *   `OptionList`; the picked row has a lighter fill and a brass check.
 * - Alone (the first-launch board step): the label (when `labelAlone`),
 *   framed tiles with a gap and a radio circle (the picked tile has a brass
 *   frame), then the group hint.
 *
 * Bold text marks the picked row in both, so color is not the only cue.
 */
import { Fragment, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';
import type { IconName } from '@/components/icons';
import { RowDivider, SectionRow, useInSectionCard } from '@/components/SectionCard';

export interface PictureOption<T extends string> {
  value: T;
  label: string;
  hint: string;
  /** Only repeats the name for the eye, so screen readers skip it. */
  picture: ReactNode;
}

interface PicturePickerProps<T extends string> {
  /** Names the group: the label row, and the radio group for screen readers. */
  label: string;
  /** One caption for the whole group. */
  hint: string;
  /** The badge of the label row in a card. */
  icon: IconName;
  /** Shows the label above the tiles outside a card too. */
  labelAlone?: boolean;
  options: readonly PictureOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testID: string;
}

export function PicturePicker<T extends string>({
  label,
  hint,
  icon,
  labelAlone = false,
  options,
  value,
  onChange,
  testID,
}: PicturePickerProps<T>) {
  const { theme } = useUnistyles();
  const inCard = useInSectionCard();
  const list = (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={styles.list(inCard)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Fragment key={option.value}>
            {/* In a card a line sits above each row: the label row is above the first. */}
            {inCard ? <RowDivider /> : null}
            <Pressable
              testID={`${testID}-${option.value}`}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityHint={option.hint}
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                inCard ? styles.cardRow(selected) : styles.tile(selected),
                pressed && styles.pressed,
              ]}>
              {inCard ? null : (
                <View style={styles.radio(selected)}>
                  {selected ? <View style={styles.dot} /> : null}
                </View>
              )}
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {option.picture}
              </View>
              <View style={styles.text}>
                <Text style={styles.name(selected)}>{option.label}</Text>
                <Text style={styles.description}>{option.hint}</Text>
              </View>
              {inCard && selected ? (
                <Icon name="check" size={20} color={theme.colors.accent} />
              ) : null}
            </Pressable>
          </Fragment>
        );
      })}
    </View>
  );

  if (inCard) {
    return (
      <>
        <SectionRow icon={icon} label={label} hint={hint} />
        {list}
      </>
    );
  }
  return (
    <>
      {labelAlone ? <Text style={styles.label}>{label}</Text> : null}
      {list}
      <Text style={styles.hint}>{hint}</Text>
    </>
  );
}

const RADIO = 22;

const styles = StyleSheet.create((theme) => ({
  label: {
    ...theme.type.body,
    color: theme.colors.text,
    paddingTop: theme.space.md,
    paddingBottom: theme.space.xs,
  },
  list: (inCard: boolean) => ({ gap: inCard ? 0 : theme.space.sm }),
  tile: (selected: boolean) => ({
    minHeight: theme.touch.row,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.md,
    borderRadius: theme.radii.lg,
    borderWidth: 2,
    borderColor: selected ? theme.colors.accent : theme.colors.border,
    backgroundColor: selected ? theme.colors.surfaceSelected : theme.colors.surface,
  }),
  cardRow: (selected: boolean) => ({
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
  name: (selected: boolean) => ({
    ...(selected ? theme.type.bodyStrong : theme.type.body),
    color: theme.colors.text,
  }),
  description: {
    ...theme.type.caption,
    color: theme.colors.textDim,
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
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    paddingTop: theme.space.xs,
  },
}));
