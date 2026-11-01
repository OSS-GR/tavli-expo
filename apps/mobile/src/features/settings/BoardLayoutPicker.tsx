/**
 * Settings → Board → Board layout (#184): Tall (default) or Classic. Each
 * row has a small picture of the game screen: a phone with the strips, the
 * board and the button row, so the picture shows where the board goes.
 *
 * - Tall: the board on its side, as large as the screen allows.
 * - Classic: the board as on a table, as wide as the screen, in the middle.
 *
 * Only the game screen follows it. The tutorial and the small board
 * pictures always show the tall board. `PicturePicker` draws it in a card
 * or alone.
 */
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { BoardView } from '@/features/board/boardModel';
import { SAMPLE_POSITIONS } from '@/features/board/positions';
import { StaticBoard } from '@/features/board/StaticBoard';

import { PicturePicker } from './PicturePicker';
import { BOARD_LAYOUT_MODES } from './settings';
import { useSettings } from './store';

const PREVIEW_VIEW: BoardView = { viewer: 'white', direction: 'contrary' };

export function BoardLayoutPicker({ testID }: { testID: string }) {
  const { t } = useTranslation();
  const value = useSettings((s) => s.boardLayout);
  const setSetting = useSettings((s) => s.setSetting);

  const options = BOARD_LAYOUT_MODES.map((mode) => ({
    value: mode,
    label: t(`settings.boardLayout.${mode}`),
    hint: t(`settings.boardLayout.${mode}Hint`),
    picture: (
      <View style={styles.phone}>
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
    ),
  }));

  return (
    <PicturePicker
      testID={testID}
      icon="smartphone"
      label={t('settings.boardLayout.label')}
      hint={t('settings.boardLayout.hint')}
      labelAlone
      options={options}
      value={value}
      onChange={(mode) => setSetting('boardLayout', mode)}
    />
  );
}

/** The phone in the picture, in points (about the shape of a phone screen). */
const PHONE = { width: 48, height: 92 };

const styles = StyleSheet.create((theme) => ({
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
}));
