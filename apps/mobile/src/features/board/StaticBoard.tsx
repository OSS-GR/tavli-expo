/**
 * A board that only shows a position (no touch). It fills its parent and
 * keeps the theme's aspect ratio, so it fits an iPhone SE and a large phone.
 */
import type { BoardState } from '@tavli/engine';
import type { ThemeManifest } from '@tavli/themes';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { HomeBoardSide } from '@/features/settings/settings';

import {
  BoardCanvas,
  portraitLayout,
  useBoardSpace,
  useBoardTheme,
  useHomeBoardSide,
} from './BoardCanvas';
import { layoutBoard, type BoardMarks, type BoardView } from './boardModel';
import { fitBoardWithShadow } from './geometry';

export interface StaticBoardProps {
  board: BoardState;
  view: BoardView;
  /** Extra marks: Asodio checkers frozen by the quarter lock. */
  marks?: BoardMarks;
  /** Draw with this theme instead of the one picked in Settings (the board picker). */
  theme?: ThemeManifest;
  /** Draw with this home board side instead of the one picked in Settings (the side picker). */
  homeSide?: HomeBoardSide;
  testID?: string;
}

export function StaticBoard({
  board,
  view,
  marks,
  theme: themeProp,
  homeSide: homeSideProp,
  testID,
}: StaticBoardProps) {
  const picked = useBoardTheme();
  const pickedSide = useHomeBoardSide();
  const theme = themeProp ?? picked;
  const homeSide = homeSideProp ?? pickedSide;
  const [size, onLayout] = useBoardSpace();
  const geo = size ? fitBoardWithShadow(portraitLayout(theme, homeSide), size) : null;
  return (
    <View testID={testID} style={styles.space} onLayout={onLayout}>
      {size && geo ? (
        <BoardCanvas
          theme={theme}
          geo={geo}
          size={size}
          picture={layoutBoard(geo, board, view, marks)}
          testID={testID ? `${testID}-canvas` : undefined}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  space: {
    flex: 1,
    alignSelf: 'stretch',
  },
});
