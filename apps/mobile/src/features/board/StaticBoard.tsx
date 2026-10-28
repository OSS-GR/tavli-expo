/**
 * A board that only shows a position (no touch). It fills its parent and
 * keeps the theme's aspect ratio, so it fits an iPhone SE and a large phone.
 * It can mark a turn the way the Hint does (`hintMarks.ts`): the game
 * review rings the played or the best turn (#230).
 */
import type { BoardState, Move, PlayerId } from '@tavli/engine';
import type { ThemeManifest } from '@tavli/themes';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { BoardLayoutMode, HomeBoardSide } from '@/features/settings/settings';

import {
  BoardCanvas,
  boardLayout,
  useBoardSpace,
  useBoardTheme,
  useHomeBoardSide,
} from './BoardCanvas';
import { layoutBoard, type BoardMarks, type BoardView } from './boardModel';
import { fitBoardWithShadow } from './geometry';
import { hintHighlights } from './hintMarks';

/** A turn to mark on the board: its moves in order, from `board`. */
export interface StaticBoardTurn {
  readonly mover: PlayerId;
  readonly moves: readonly Move[];
}

export interface StaticBoardProps {
  board: BoardState;
  view: BoardView;
  /** Extra marks: Asodio checkers frozen by the quarter lock. */
  marks?: BoardMarks;
  /** Draw with this theme instead of the one picked in Settings (the board picker). */
  theme?: ThemeManifest;
  /** Draw with this home board side instead of the one picked in Settings (the side picker). */
  homeSide?: HomeBoardSide;
  /** The tall board on its side (default) or the classic wide board (the layout picker, #184). */
  layout?: BoardLayoutMode;
  /**
   * Mark this turn as the Hint does: a ring on each checker that moves and
   * a target ring with its ghost where it lands (#230, the game review).
   */
  turn?: StaticBoardTurn;
  testID?: string;
}

export function StaticBoard({
  board,
  view,
  marks,
  theme: themeProp,
  homeSide: homeSideProp,
  layout = 'tall',
  turn,
  testID,
}: StaticBoardProps) {
  const picked = useBoardTheme();
  const pickedSide = useHomeBoardSide();
  const theme = themeProp ?? picked;
  const homeSide = homeSideProp ?? pickedSide;
  const [size, onLayout] = useBoardSpace();
  const geo = size ? fitBoardWithShadow(boardLayout(theme, layout, homeSide), size) : null;
  const highlights =
    geo && turn && turn.moves.length > 0
      ? hintHighlights(geo, board, view, turn.mover, turn.moves)
      : undefined;
  return (
    <View testID={testID} style={styles.space} onLayout={onLayout}>
      {size && geo ? (
        <BoardCanvas
          theme={theme}
          geo={geo}
          size={size}
          picture={layoutBoard(geo, board, view, marks)}
          {...(highlights ? { highlights } : {})}
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
