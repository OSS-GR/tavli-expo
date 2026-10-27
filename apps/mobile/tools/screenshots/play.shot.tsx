/**
 * A screenshot of a turn in progress (#32), like wireframe 6c: White played
 * 13/7 with the 6 and picked up a checker on 8; the legal target lights up.
 * Below the board, the dice row with the used 6 faded. Player strips and
 * buttons are React Native views, so they are not in this picture.
 */
import { Fill } from '@shopify/react-native-skia/lib/commonjs/headless';
import {
  applyGameAction,
  createGameFlow,
  currentBoard,
  legalNextMoves,
  portes,
  type GameFlow,
} from '@tavli/engine';
import { getLayout, getTheme } from '@tavli/themes';
import { expect, it } from 'vitest';

import { layoutBoard, type BoardView } from '@/features/board/boardModel';
import { USED_OPACITY, dicePlaces } from '@/features/board/diceMotion';
import { checkerRadius, fitBoardWithShadow } from '@/features/board/geometry';
import { buildSources } from '@/features/board/interaction';
import { BoardScene } from '@/features/board/skia/BoardScene';
import { DieShape } from '@/features/board/skia/DieShape';
import { diceView } from '@/features/game/gameStore';

import { loadFont, loadSkia, loadThemeImages, writePng } from './render';

const MAX_BYTES = 300 * 1024;
const theme = getTheme('walnut-kafeneio');
const layout = getLayout(theme, 'portrait-rotated');
const WIDTH = 360;
const BOARD_HEIGHT = 560;
const DICE_HEIGHT = 70;

it('renders a turn in progress', async () => {
  await loadSkia();
  const images = loadThemeImages(theme, 1);

  // White starts with 6-3 and plays 13/7 with the 6.
  let flow: GameFlow = createGameFlow({
    state: portes.initialState({ startingPlayer: 'white' }),
    starter: 'white',
  });
  flow = applyGameAction(flow, { type: 'roll', player: 'white', dice: [6, 3] });
  flow = applyGameAction(flow, {
    type: 'move',
    player: 'white',
    move: { from: 13, to: 7, die: 6 },
  });

  const view: BoardView = { viewer: 'white', direction: 'contrary' };
  const board = currentBoard(flow);
  const geo = fitBoardWithShadow(layout, { width: WIDTH, height: BOARD_HEIGHT });
  const picture = layoutBoard(geo, board, view);
  const sources = buildSources(geo, board, view, 'white', legalNextMoves(flow));
  const picked = sources.find((s) => s.key === 'p8');
  if (!picked) throw new Error('8 should be movable');
  const highlights = {
    select: picked.checker,
    targets: picked.targets.map((t) => ({ key: t.key, x: t.landing.x, y: t.landing.y, r: t.r })),
  };

  const dice = diceView([6, 3], [3]);
  const row = dicePlaces(dice.length);
  const dx = (WIDTH - row.width) / 2;
  const dy = BOARD_HEIGHT + (DICE_HEIGHT - row.height) / 2;
  const tilt = layout.dice.tilt;

  const { file, bytes } = await writePng(
    'play-moving.png',
    WIDTH,
    BOARD_HEIGHT + DICE_HEIGHT,
    1,
    <>
      <Fill color={theme.palette['ui.bg'] ?? theme.points.dark.fill} />
      <BoardScene
        theme={theme}
        geo={geo}
        images={images}
        picture={picture}
        font={loadFont(theme.checkers.badge.fontSize * checkerRadius(geo))}
        highlights={highlights}
      />
      {dice.map((d, i) => {
        const place = row.places[i]!;
        return (
          <DieShape
            key={i}
            style={theme.dice}
            x={dx + place.x}
            y={dy + place.y}
            size={place.size}
            value={d.value}
            tilt={tilt[i % 2]}
            opacity={d.used ? USED_OPACITY : 1}
          />
        );
      })}
    </>,
  );
  console.log(`${file}: ${Math.round(bytes / 1024)} KB`);
  expect(bytes).toBeLessThan(MAX_BYTES);
});
