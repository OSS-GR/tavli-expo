import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { getLayout, getTheme } from '@tavli/themes';

import { getPreset } from '@tavli/engine';

import type { HomeBoardSide } from '@/features/settings/settings';

import { asodioMarks } from './asodio';
import { portraitLayout } from './BoardCanvas';
import { layoutBoard, type BoardView } from './boardModel';
import { fitBoard, fitBoardWithShadow } from './geometry';
import { rgba } from './paint';
import { SAMPLE_DIRECTIONS, SAMPLE_POSITIONS } from './positions';
import { BoardScene, COMBINED_MARK, FROZEN_MARK, PIN_RING_WIDTH } from './skia/BoardScene';
import { StaticBoard } from './StaticBoard';
import { THEME_IMAGES } from './themeImages';
import { layoutImageKeys } from './useBoardAssets';

import { countNodes, findAllNodes, type JsonNode } from '../../../test/tree';

const theme = getTheme('walnut-kafeneio');
const layout = getLayout(theme, 'portrait-rotated');
const geo = fitBoard(layout, { width: 377, height: 630 });
const WHITE: BoardView = { viewer: 'white', direction: 'contrary' };

const font = {
  getSize: () => 11,
  measureText: (text: string) => ({ x: 0, y: 0, width: text.length * 6, height: 11 }),
} as never;

const tree = () => screen.toJSON() as JsonNode | null;
const count = (type: string) => countNodes(tree(), type);
const find = (match: (n: JsonNode) => boolean) => findAllNodes(tree(), match);

describe('<BoardScene />', () => {
  it('draws 24 points, every checker and the badge of a tall stack', async () => {
    const picture = layoutBoard(geo, SAMPLE_POSITIONS.midgame, WHITE);
    await render(<BoardScene theme={theme} geo={geo} images={{}} picture={picture} font={font} />);
    // Each point: a color fill and a seam stroke (no texture without images).
    expect(count('Path')).toBe(48);
    // The badge text.
    expect(find((n) => n.type === 'Text' && n.props.text === '7')).toHaveLength(1);
    // One rim per drawn checker. White: 7 on point 6 show as 5, plus 3 + 2 + 2 + 1 on the bar.
    const rims = (color: string) =>
      find((n) => n.type === 'Circle' && n.props.style === 'stroke' && n.props.color === color);
    expect(rims(theme.checkers.light.rim.color)).toHaveLength(13);
    expect(rims(theme.checkers.dark.rim.color)).toHaveLength(11);
    // Four borne-off checkers in Black's tray: a fill, a bevel and an edge each.
    const fills = find(
      (n) => n.type === 'RoundedRect' && n.props.color === theme.checkers.dark.fill,
    );
    expect(fills).toHaveLength(4);
  });

  it('draws pinned checkers (Plakoto) with a ring, before the checkers on top', async () => {
    const picture = layoutBoard(geo, SAMPLE_POSITIONS.plakotoPins, WHITE);
    await render(<BoardScene theme={theme} geo={geo} images={{}} picture={picture} font={font} />);
    const rings = find(
      (n) =>
        n.type === 'Circle' &&
        n.props.style === 'stroke' &&
        n.props.color === theme.checkers.badge.fill &&
        n.props.strokeWidth === PIN_RING_WIDTH * picture.pins[0]!.r,
    );
    expect(rings).toHaveLength(2);
    // Every checker has its rim: 15 light and 15 dark, the 2 pinned ones too.
    const rims = (color: string) =>
      find((n) => n.type === 'Circle' && n.props.style === 'stroke' && n.props.color === color);
    expect(rims(theme.checkers.light.rim.color)).toHaveLength(
      picture.checkers.filter((c) => c.owner === 'white').length + 1,
    );
    expect(rims(theme.checkers.dark.rim.color)).toHaveLength(
      picture.checkers.filter((c) => c.owner === 'black').length + 1,
    );
  });

  it('drops the pin ring while the pinner is in the air', async () => {
    const picture = layoutBoard(geo, SAMPLE_POSITIONS.plakotoPins, WHITE);
    await render(
      <BoardScene
        theme={theme}
        geo={geo}
        images={{}}
        picture={picture}
        font={font}
        hidden={new Set(['p24:0'])}
      />,
    );
    const rings = find(
      (n) =>
        n.type === 'Circle' &&
        n.props.color === theme.checkers.badge.fill &&
        n.props.strokeWidth === PIN_RING_WIDTH * picture.pins[0]!.r,
    );
    expect(rings.map((n) => n.props.opacity).sort()).toEqual([0, 1]);
  });

  it('draws the Fevga start in opposite corners', async () => {
    const picture = layoutBoard(geo, SAMPLE_POSITIONS.fevgaStart, {
      viewer: 'white',
      direction: SAMPLE_DIRECTIONS.fevgaStart,
    });
    await render(<BoardScene theme={theme} geo={geo} images={{}} picture={picture} font={font} />);
    expect(find((n) => n.type === 'Text' && n.props.text === '15')).toHaveLength(2);
    expect(picture.badges.map((b) => b.key).sort()).toEqual(['p12', 'p24']);
  });

  it('draws the Asodio "to enter" stacks with their counts', async () => {
    const picture = layoutBoard(geo, SAMPLE_POSITIONS.asodioStart, WHITE);
    await render(<BoardScene theme={theme} geo={geo} images={{}} picture={picture} font={font} />);
    expect(find((n) => n.type === 'Text' && n.props.text === '15')).toHaveLength(2);
    expect(picture.badges.map((b) => b.key).sort()).toEqual(['bar:opponent', 'bar:player']);
  });

  it('shades the checkers the Asodio quarter lock freezes, and only those', async () => {
    const board = SAMPLE_POSITIONS.asodioFrozen;
    const marks = asodioMarks(board, getPreset('asodio.kafeneio'), WHITE);
    const picture = layoutBoard(geo, board, WHITE, marks);
    await render(<BoardScene theme={theme} geo={geo} images={{}} picture={picture} font={font} />);
    const shade = rgba(FROZEN_MARK.shade.color, FROZEN_MARK.shade.opacity);
    const ring = rgba(FROZEN_MARK.ring.color, FROZEN_MARK.ring.opacity);
    const frozen = picture.checkers.filter((c) => c.frozen).length;
    expect(frozen).toBeGreaterThan(0);
    expect(find((n) => n.type === 'Circle' && n.props.color === shade)).toHaveLength(frozen);
    expect(find((n) => n.type === 'Circle' && n.props.color === ring)).toHaveLength(frozen);
    // Without marks nothing is shaded.
    await render(
      <BoardScene
        theme={theme}
        geo={geo}
        images={{}}
        picture={layoutBoard(geo, board, WHITE)}
        font={font}
      />,
    );
    expect(find((n) => n.type === 'Circle' && n.props.color === shade)).toHaveLength(0);
  });

  it('adds the wood texture and the image layers once images load', async () => {
    const picture = layoutBoard(geo, SAMPLE_POSITIONS.start, WHITE);
    const image = { width: () => 160, height: () => 160 } as never;
    const images = Object.fromEntries(layoutImageKeys(theme, layout).map((k) => [k, image]));
    await render(
      <BoardScene theme={theme} geo={geo} images={images} picture={picture} font={font} />,
    );
    expect(count('ImageShader')).toBe(24);
    expect(count('Image')).toBe(layout.layers.length);
  });

  it('hides a checker and draws highlights', async () => {
    const picture = layoutBoard(geo, SAMPLE_POSITIONS.start, WHITE);
    const all = picture.checkers.length;
    const c = picture.checkers[0]!;
    await render(
      <BoardScene
        theme={theme}
        geo={geo}
        images={{}}
        picture={picture}
        font={null}
        hidden={new Set([c.key])}
        highlights={{
          select: { key: c.key, x: c.x, y: c.y, r: c.r },
          targets: [{ key: 'p10', x: 10, y: 10, r: c.r }],
        }}
      />,
    );
    expect(count('DashPathEffect')).toBe(1);
    // A checker has one rim stroke drawn at its own radius minus the rim inset.
    const rimR = c.r - theme.checkers.light.rim.inset * c.r;
    const rims = find((n) => n.type === 'Circle' && n.props.r === rimR);
    expect(rims).toHaveLength(all - 1);
  });
  // #180: a target for one checker with several dice looks different from
  // a one-die target: no fill, a dotted ring, and one dot per die.
  it('draws a combined target with a dotted ring and one dot per die', async () => {
    const picture = layoutBoard(geo, SAMPLE_POSITIONS.start, WHITE);
    const c = picture.checkers[0]!;
    const hl = theme.highlights.target;
    const fill = rgba(hl.color, hl.fillOpacity);
    await render(
      <BoardScene
        theme={theme}
        geo={geo}
        images={{}}
        picture={picture}
        font={null}
        highlights={{
          select: { key: c.key, x: c.x, y: c.y, r: c.r },
          targets: [
            { key: 'p10', x: 10, y: 10, r: c.r },
            { key: 'p5', x: 50, y: 10, r: c.r, steps: 2 },
            { key: 'p1', x: 90, y: 10, r: c.r, steps: 4 },
          ],
        }}
      />,
    );
    // Every target has its ring; only the one-die target has the fill.
    expect(count('DashPathEffect')).toBe(3);
    expect(find((n) => n.type === 'Circle' && n.props.color === fill)).toHaveLength(1);
    const dashes = find((n) => n.type === 'DashPathEffect').map(
      (n) => (n.props.intervals as number[])[0],
    );
    expect(dashes[0]).toBeCloseTo(hl.dash[0] * c.r);
    expect(dashes[1]).toBeCloseTo(hl.dash[0] * COMBINED_MARK.dash * c.r);
    // 2 + 4 dots, each filled in the target color.
    const dots = find(
      (n) => n.type === 'Circle' && n.props.r === COMBINED_MARK.dot * c.r && !n.props.style,
    );
    expect(dots).toHaveLength(6);
    expect(dots.every((d) => d.props.color === hl.color)).toBe(true);
    // The dots of one target sit in a row around its center.
    const xs = dots.filter((d) => d.props.cy === 10 && (d.props.cx as number) < 70);
    expect(xs.map((d) => d.props.cx as number).reduce((a, b) => a + b, 0) / xs.length).toBeCloseTo(
      50,
    );
  });
});

describe('<StaticBoard />', () => {
  it('draws after the first layout and fits the space', async () => {
    await render(<StaticBoard testID="board" board={SAMPLE_POSITIONS.start} view={WHITE} />);
    expect(screen.queryByTestId('board-canvas')).toBeNull();
    await act(async () => {
      fireEvent(screen.getByTestId('board'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 455 } },
      });
    });
    const canvas = screen.getByTestId('board-canvas');
    expect(canvas.props.style).toEqual({ width: 375, height: 455 });
  });

  // #175: Settings → Home board on the bottom left mirrors the drawing.
  it('draws the mirrored board when the home is on the bottom left', async () => {
    const size = { width: 377, height: 630 };
    /** The centers of White's drawn checkers (their rim strokes). */
    const whiteCheckers = async (side: HomeBoardSide) => {
      await render(
        <StaticBoard testID="board" board={SAMPLE_POSITIONS.start} view={WHITE} homeSide={side} />,
      );
      await act(async () => {
        fireEvent(screen.getByTestId('board'), 'layout', {
          nativeEvent: { layout: { x: 0, y: 0, ...size } },
        });
      });
      return find(
        (n) =>
          n.type === 'Circle' &&
          n.props.style === 'stroke' &&
          n.props.color === theme.checkers.light.rim.color,
      ).map((n) => ({ x: n.props.cx as number, y: n.props.cy as number }));
    };
    const normal = await whiteCheckers('right');
    const mirrored = await whiteCheckers('left');
    expect(normal).toHaveLength(15); // 2 + 5 + 3 + 5
    const board = fitBoardWithShadow(layout, size);
    const flipX = (x: number) => 2 * board.x + board.width - x;
    const key = (p: { x: number; y: number }) => `${p.x.toFixed(2)}:${p.y.toFixed(2)}`;
    expect(mirrored.map(key).sort()).toEqual(
      normal.map((p) => key({ x: flipX(p.x), y: p.y })).sort(),
    );
    // White starts at the bottom left now: its 24 is left of the middle.
    const start = mirrored.filter((p) => p.y > board.y + board.height * 0.8);
    expect(start.every((p) => p.x < board.x + board.width / 2)).toBe(true);
  });

  it('keeps one mirrored layout per theme', () => {
    expect(portraitLayout(theme, 'right')).toBe(layout);
    expect(portraitLayout(theme, 'left')).toBe(portraitLayout(theme, 'left'));
    expect(portraitLayout(theme, 'left')).not.toBe(layout);
  });
});

describe('theme images', () => {
  it('has a Metro require for every image of every bundled theme', () => {
    const map = THEME_IMAGES[theme.id] ?? {};
    expect(Object.keys(map).sort()).toEqual(Object.keys(theme.images).sort());
  });
});
