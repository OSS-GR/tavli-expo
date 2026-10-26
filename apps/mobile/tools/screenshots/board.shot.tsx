/**
 * Board screenshots for review (#29): the same `BoardScene` the app draws,
 * rendered headless. Run: `pnpm --filter @tavli/mobile screenshots`.
 */
import { Fill } from '@shopify/react-native-skia/lib/commonjs/headless';
import { getLayout, getTheme } from '@tavli/themes';
import { expect, it } from 'vitest';

import { layoutBoard, type BoardView } from '@/features/board/boardModel';
import { checkerRadius, fitBoardWithShadow } from '@/features/board/geometry';
import { SAMPLE_POSITIONS, type SamplePositionId } from '@/features/board/positions';
import { BoardScene } from '@/features/board/skia/BoardScene';

import { loadFont, loadSkia, loadThemeImages, writePng } from './render';

/** Keep every PNG small enough for the repo. */
const MAX_BYTES = 300 * 1024;

const theme = getTheme('walnut-kafeneio');
const layout = getLayout(theme, 'portrait-rotated');

interface BoardShot {
  file: string;
  position: SamplePositionId;
  view: BoardView;
  /** Canvas size in points: the board area of a phone. */
  width: number;
  height: number;
}

const SHOTS: BoardShot[] = [
  // iPhone 15 board area, White at the bottom.
  {
    file: 'board-start.png',
    position: 'start',
    view: { viewer: 'white', direction: 'contrary' },
    width: 360,
    height: 590,
  },
  // Black's turn in flip mode: the board is mirrored, Black's home is bottom left.
  {
    file: 'board-midgame-black-view.png',
    position: 'midgame',
    view: { viewer: 'black', direction: 'contrary' },
    width: 360,
    height: 590,
  },
];

it('renders the board screenshots', async () => {
  await loadSkia();
  const images = loadThemeImages(theme, 1);
  for (const shot of SHOTS) {
    const geo = fitBoardWithShadow(layout, shot);
    const font = loadFont(theme.checkers.badge.fontSize * checkerRadius(geo));
    const picture = layoutBoard(geo, SAMPLE_POSITIONS[shot.position], shot.view);
    const { file, bytes } = await writePng(
      shot.file,
      shot.width,
      shot.height,
      1,
      <>
        <Fill color={theme.palette['ui.bg'] ?? theme.points.dark.fill} />
        <BoardScene theme={theme} geo={geo} images={images} picture={picture} font={font} />
      </>,
    );
    console.log(`${file}: ${Math.round(bytes / 1024)} KB`);
    expect(bytes).toBeLessThan(MAX_BYTES);
  }
});
