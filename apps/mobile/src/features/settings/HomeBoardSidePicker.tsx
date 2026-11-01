/**
 * Settings → Board → Your home (#175): bottom right (default) or bottom
 * left, as on a real board seen from your seat. Each row has a small
 * picture of the start position, turned the way a real board lies in front
 * of you, so the picture shows the home where the label says.
 *
 * In the game the phone shows the board on its side (portrait), with your
 * home at the bottom of the screen. Bottom left mirrors that board left to
 * right (`portraitLayout`), so the checkers go round the other way.
 * `PicturePicker` draws it in a card or alone.
 */
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { BoardView } from '@/features/board/boardModel';
import { SAMPLE_POSITIONS } from '@/features/board/positions';
import { StaticBoard } from '@/features/board/StaticBoard';

import { PicturePicker } from './PicturePicker';
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

  const options = HOME_BOARD_SIDES.map((side) => ({
    value: side,
    label: t(`settings.homeBoard.${side}`),
    hint: t(`settings.homeBoard.${side}Hint`),
    picture: (
      <View style={styles.preview}>
        <View style={styles.turned(TURN[side])}>
          <StaticBoard
            testID={`${testID}-${side}-preview`}
            board={SAMPLE_POSITIONS.start}
            view={PREVIEW_VIEW}
            homeSide={side}
          />
        </View>
      </View>
    ),
  }));

  return (
    <PicturePicker
      testID={testID}
      icon="house"
      label={t('settings.homeBoard.label')}
      hint={t('settings.homeBoard.hint')}
      labelAlone
      options={options}
      value={value}
      onChange={(side) => setSetting('homeBoardSide', side)}
    />
  );
}

/** Preview size in points: the board lies on its long side (about 1.67 wide per 1 tall). */
const PREVIEW = { width: 104, height: 64 };

const styles = StyleSheet.create({
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
});
