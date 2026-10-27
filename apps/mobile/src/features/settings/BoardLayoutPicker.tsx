/**
 * Settings → Board → Board layout (#184): Tall (default) or Classic. Each
 * row has a small picture of the game screen: a phone with the strips, the
 * board and the button row, so the picture shows where the board goes.
 *
 * - Tall: the board on its side, as large as the screen allows.
 * - Classic: the board as on a table, as wide as the screen, in the middle.
 *
 * Only the game screen follows it. The tutorial and the small board
 * pictures always show the tall board.
 */
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { BoardView } from '@/features/board/boardModel';
import { SAMPLE_POSITIONS } from '@/features/board/positions';
import { StaticBoard } from '@/features/board/StaticBoard';

import { BOARD_LAYOUT_MODES } from './settings';
import { useSettings } from './store';

const PREVIEW_VIEW: BoardView = { viewer: 'white', direction: 'contrary' };

export function BoardLayoutPicker({ testID }: { testID: string }) {
  const { t } = useTranslation();
  const value = useSettings((s) => s.boardLayout);
  const setSetting = useSettings((s) => s.setSetting);

  return (
    <>
      <Text style={styles.label}>{t('settings.boardLayout.label')}</Text>
      <View
        testID={testID}
        accessibilityRole="radiogroup"
        accessibilityLabel={t('settings.boardLayout.label')}
        style={styles.list}>
        {BOARD_LAYOUT_MODES.map((mode) => {
          const selected = mode === value;
          const name = t(`settings.boardLayout.${mode}`);
          const hint = t(`settings.boardLayout.${mode}Hint`);
          return (
            <Pressable
              key={mode}
              testID={`${testID}-${mode}`}
              accessibilityRole="radio"
              accessibilityLabel={name}
              accessibilityHint={hint}
              accessibilityState={{ checked: selected }}
              onPress={() => setSetting('boardLayout', mode)}
              style={({ pressed }) => [styles.row(selected), pressed && styles.pressed]}>
              <View style={styles.radio(selected)}>
                {selected ? <View style={styles.dot} /> : null}
              </View>
              {/* The picture only repeats the label for the eye, so screen readers skip it. */}
              <View
                style={styles.phone}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants">
                {/* Classic: the strips hug the board in the middle. Tall: the board fills the phone. */}
                <View style={styles.space(mode === 'classic')}>
                  <View style={styles.bar} />
                  <View style={styles.board(mode === 'classic')}>
                    <StaticBoard
                      testID={`${testID}-${mode}-preview`}
                      board={SAMPLE_POSITIONS.start}
                      view={PREVIEW_VIEW}
                      layout={mode}
                    />
                  </View>
                  <View style={styles.bar} />
                </View>
                <View style={styles.buttons} />
              </View>
              <View style={styles.text}>
                <Text style={styles.name(selected)}>{name}</Text>
                <Text style={styles.description}>{hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>{t('settings.boardLayout.hint')}</Text>
    </>
  );
}

const RADIO = 22;
/** The phone in the picture, in points (about the shape of a phone screen). */
const PHONE = { width: 48, height: 92 };

const styles = StyleSheet.create((theme) => ({
  label: {
    ...theme.type.body,
    color: theme.colors.text,
    paddingTop: theme.space.md,
    paddingBottom: theme.space.xs,
  },
  list: {
    gap: theme.space.sm,
  },
  row: (selected: boolean) => ({
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
  pressed: {
    opacity: 0.7,
  },
  phone: {
    width: PHONE.width,
    height: PHONE.height,
    padding: 3,
    gap: 2,
    borderRadius: theme.radii.md,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  // A strip above or below the board.
  bar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  // The button row at the bottom.
  buttons: {
    height: 8,
    borderRadius: 3,
    backgroundColor: theme.colors.accent,
  },
  space: (classic: boolean) => ({
    flex: 1,
    gap: 2,
    justifyContent: classic ? 'center' : 'flex-start',
  }),
  board: (classic: boolean) => (classic ? { height: 26 } : { flex: 1 }),
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
