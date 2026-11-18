/**
 * Board starting position (#184, #623, Figma "30 · Board starting
 * position"): Portrait (`tall`, the default) or Landscape (`classic`). Two
 * tiles side by side, each a phone held upright with the game screen, so
 * the picture shows where the board goes. Under them a phone on its side:
 * on its side the game always draws the wide board, whichever you pick.
 *
 * - Portrait: the board on its side, as large as the screen allows.
 * - Landscape: the board as on a table, as wide as the screen, in the middle.
 *
 * Only the game screen follows it. The tutorial and the small board
 * pictures always show the portrait board. Settings → Board & look puts it
 * in a `SectionCard` (the card has the title); the first-launch board step
 * shows it alone with `labelAbove`. Each tap saves at once.
 */
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { BoardView } from '@/features/board/boardModel';
import { SAMPLE_POSITIONS } from '@/features/board/positions';
import { StaticBoard } from '@/features/board/StaticBoard';

import { BOARD_LAYOUT_MODES, type BoardLayoutMode } from './settings';
import { useSettings } from './store';

const PREVIEW_VIEW: BoardView = { viewer: 'white', direction: 'contrary' };

export interface BoardLayoutPickerProps {
  testID: string;
  /** Shows the label above the tiles (when no card title names them). */
  labelAbove?: boolean;
}

export function BoardLayoutPicker({ testID, labelAbove = false }: BoardLayoutPickerProps) {
  const { t } = useTranslation();
  const value = useSettings((s) => s.boardLayout);
  const setSetting = useSettings((s) => s.setSetting);
  const label = t('settings.boardLayout.label');

  return (
    <View style={styles.root}>
      {labelAbove ? <Text style={styles.label}>{label}</Text> : null}
      <View
        testID={testID}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={styles.tiles}>
        {BOARD_LAYOUT_MODES.map((mode) => {
          const selected = mode === value;
          return (
            <Pressable
              key={mode}
              testID={`${testID}-${mode}`}
              accessibilityRole="radio"
              accessibilityLabel={t(`settings.boardLayout.${mode}`)}
              accessibilityHint={t(`settings.boardLayout.${mode}Hint`)}
              accessibilityState={{ checked: selected }}
              onPress={() => setSetting('boardLayout', mode)}
              style={({ pressed }) => [styles.tile(selected), pressed && styles.pressed]}>
              {/* Only repeats the name for the eye, so screen readers skip it. */}
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <UprightPhone mode={mode} testID={`${testID}-${mode}-preview`} />
              </View>
              <View style={styles.nameRow}>
                <View style={styles.radio(selected)}>
                  {selected ? <View style={styles.dot} /> : null}
                </View>
                <Text style={styles.name(selected)}>{t(`settings.boardLayout.${mode}`)}</Text>
              </View>
              <Text style={styles.description}>{t(`settings.boardLayout.${mode}Hint`)}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.sideways}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <SidewaysPhone testID={`${testID}-sideways-preview`} />
        </View>
        <Text style={styles.sidewaysText}>{t('settings.boardLayout.sideways')}</Text>
      </View>
    </View>
  );
}

/** A phone held upright with the game screen: the strips, the board and the button row. */
function UprightPhone({ mode, testID }: { mode: BoardLayoutMode; testID: string }) {
  const classic = mode === 'classic';
  return (
    <View style={styles.phone}>
      <View style={styles.speaker} />
      {/* Landscape: the strips hug the board in the middle. Portrait: the board fills the phone. */}
      <View style={styles.space(classic)}>
        <View style={styles.bar} />
        <View style={styles.board(classic)}>
          <StaticBoard
            testID={testID}
            board={SAMPLE_POSITIONS.start}
            view={PREVIEW_VIEW}
            layout={mode}
          />
        </View>
        <View style={styles.bar} />
      </View>
      <View style={styles.buttons} />
    </View>
  );
}

/** A phone on its side: the seats rail, the wide board and the buttons rail. */
function SidewaysPhone({ testID }: { testID: string }) {
  return (
    <View style={styles.sidewaysPhone}>
      <View style={styles.rail} />
      <View style={styles.wideBoard}>
        <StaticBoard
          testID={testID}
          board={SAMPLE_POSITIONS.start}
          view={PREVIEW_VIEW}
          layout="classic"
        />
      </View>
      <View style={styles.buttonRail} />
    </View>
  );
}

/** The upright phone in a tile, in points (about the shape of a phone screen). */
const PHONE = { width: 64, height: 128 };
/** The phone on its side. */
const SIDEWAYS = { width: 112, height: 56 };
const RADIO = 20;

const styles = StyleSheet.create((theme) => ({
  root: {
    gap: theme.space.md,
  },
  label: {
    ...theme.type.body,
    color: theme.colors.text,
    paddingTop: theme.space.md,
  },
  tiles: {
    flexDirection: 'row',
    gap: theme.space.sm,
  },
  tile: (selected: boolean) => ({
    flex: 1,
    alignItems: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.md,
    borderRadius: theme.radii.lg,
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? theme.colors.accent : theme.colors.border,
    backgroundColor: selected ? theme.colors.surfaceSelected : theme.colors.backgroundDeep,
  }),
  pressed: {
    opacity: 0.7,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
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
  // Bold marks the pick too, so color is not the only cue.
  name: (selected: boolean) => ({
    ...(selected ? theme.type.bodyStrong : theme.type.body),
    color: theme.colors.text,
    flexShrink: 1,
  }),
  description: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  phone: {
    width: PHONE.width,
    height: PHONE.height,
    paddingHorizontal: 3,
    paddingVertical: 4,
    gap: 3,
    borderRadius: theme.radii.md,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  speaker: {
    alignSelf: 'center',
    width: '30%',
    height: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  // A strip above or below the board.
  bar: {
    height: 5,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  // The button row at the bottom.
  buttons: {
    height: 9,
    borderRadius: 4,
    backgroundColor: theme.colors.accent,
  },
  space: (classic: boolean) => ({
    flex: 1,
    gap: 3,
    justifyContent: classic ? 'center' : 'flex-start',
  }),
  board: (classic: boolean) => ({
    height: classic ? 36 : undefined,
    flex: classic ? undefined : 1,
  }),
  sideways: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    paddingTop: theme.space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  sidewaysPhone: {
    width: SIDEWAYS.width,
    height: SIDEWAYS.height,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 3,
    gap: 3,
    borderRadius: theme.radii.md,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  rail: {
    width: 10,
    alignSelf: 'stretch',
    borderRadius: 3,
    backgroundColor: theme.colors.border,
  },
  buttonRail: {
    width: 10,
    alignSelf: 'stretch',
    borderRadius: 3,
    backgroundColor: theme.colors.accent,
  },
  wideBoard: {
    flex: 1,
    alignSelf: 'stretch',
  },
  sidewaysText: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    flex: 1,
  },
}));
