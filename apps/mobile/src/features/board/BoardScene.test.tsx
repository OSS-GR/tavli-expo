import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { getLayout, getTheme } from '@tavli/themes';

import { getPreset } from '@tavli/engine';

import { asodioMarks } from './asodio';
import { layoutBoard, type BoardView } from './boardModel';
import { fitBoard } from './geometry';
import { rgba } from './paint';
import { SAMPLE_DIRECTIONS, SAMPLE_POSITIONS } from './positions';
import { BoardScene, FROZEN_MARK, PIN_RING_WIDTH } from './skia/BoardScene';
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
});

describe('theme images', () => {
  it('has a Metro require for every image of every bundled theme', () => {
    const map = THEME_IMAGES[theme.id] ?? {};
    expect(Object.keys(map).sort()).toEqual(Object.keys(theme.images).sort());
  });
});
