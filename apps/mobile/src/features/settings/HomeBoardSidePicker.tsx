/**
 * Settings → Board → Your home (#175): bottom right (default) or bottom
 * left, as on a real board seen from your seat. Each row has a small
 * picture of the start position, turned the way a real board lies in front
 * of you, so the picture shows the home where the label says.
 *
 * In the game the phone shows the board on its side (portrait), with your
 * home at the bottom of the screen. Bottom left mirrors that board left to
 * right (`portraitLayout`), so the checkers go round the other way.
 */
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { BoardView } from '@/features/board/boardModel';
import { SAMPLE_POSITIONS } from '@/features/board/positions';
import { StaticBoard } from '@/features/board/StaticBoard';

import { HOME_BOARD_SIDES, type HomeBoardSide } from './settings';
import { useSettings } from './store';

const PREVIEW_VIEW: BoardView = { viewer: 'white', direction: 'contrary' };

/**
 * How to turn the phone board so it lies like a real board in front of you.
 * Bottom right: the phone board is a real board turned a quarter clockwise,
 * so we turn it back. Bottom left: the mirrored board, turned the other way.
 */
const TURN: Readonly<Record<HomeBoardSide, string>> = { right: '-90deg', left: '90deg' };

export function HomeBoardSidePicker({ testID }: { testID: string }) {
  const { t } = useTranslation();
  const value = useSettings((s) => s.homeBoardSide);
  const setSetting = useSettings((s) => s.setSetting);

  return (
    <>
      <Text style={styles.label}>{t('settings.homeBoard.label')}</Text>
      <View
        testID={testID}
        accessibilityRole="radiogroup"
        accessibilityLabel={t('settings.homeBoard.label')}
        style={styles.list}>
        {HOME_BOARD_SIDES.map((side) => {
          const selected = side === value;
          const name = t(`settings.homeBoard.${side}`);
          const hint = t(`settings.homeBoard.${side}Hint`);
          return (
            <Pressable
              key={side}
              testID={`${testID}-${side}`}
              accessibilityRole="radio"
              accessibilityLabel={name}
              accessibilityHint={hint}
              accessibilityState={{ checked: selected }}
              onPress={() => setSetting('homeBoardSide', side)}
              style={({ pressed }) => [styles.row(selected), pressed && styles.pressed]}>
              <View style={styles.radio(selected)}>
                {selected ? <View style={styles.dot} /> : null}
              </View>
              {/* The picture only repeats the label for the eye, so screen readers skip it. */}
              <View
                style={styles.preview}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants">
                <View style={styles.turned(TURN[side])}>
                  <StaticBoard
                    testID={`${testID}-${side}-preview`}
                    board={SAMPLE_POSITIONS.start}
                    view={PREVIEW_VIEW}
                    homeSide={side}
                  />
                </View>
              </View>
              <View style={styles.text}>
                <Text style={styles.name(selected)}>{name}</Text>
                <Text style={styles.description}>{hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>{t('settings.homeBoard.hint')}</Text>
    </>
  );
}

const RADIO = 22;
/** Preview size in points: the board lies on its long side (about 1.67 wide per 1 tall). */
const PREVIEW = { width: 104, height: 64 };

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
  preview: {
    width: PREVIEW.width,
    height: PREVIEW.height,
  },
  // A portrait box (the board as the phone shows it), turned a quarter
  // around its center so it fills the landscape preview.
  turned: (rotate: string) => ({
    position: 'absolute',
    width: PREVIEW.height,
    height: PREVIEW.width,
    left: (PREVIEW.width - PREVIEW.height) / 2,
    top: (PREVIEW.height - PREVIEW.width) / 2,
    transform: [{ rotate }],
  }),
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
