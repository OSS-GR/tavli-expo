import { createBoard } from '@tavli/engine';
import { getLayout, getTheme } from '@tavli/themes';

import {
  boardStacks,
  countIn,
  layoutBoard,
  layoutIndexOf,
  sideOf,
  slotOfDestination,
  slotOfOrigin,
  toneOf,
  topCheckerKey,
  type BoardView,
} from './boardModel';
import { fitBoard, slotRect } from './geometry';
import { SAMPLE_POSITIONS } from './positions';

const layout = getLayout(getTheme('walnut-kafeneio'), 'portrait-rotated');
const geo = fitBoard(layout, { width: 377, height: 630 });
const WHITE: BoardView = { viewer: 'white', direction: 'contrary' };
const BLACK: BoardView = { viewer: 'black', direction: 'contrary' };

describe('board view', () => {
  it('keeps White numbering when White is at the bottom', () => {
    expect(layoutIndexOf(24, WHITE)).toBe(24);
    expect(layoutIndexOf(1, WHITE)).toBe(1);
  });

  it('mirrors the board for Black (flip)', () => {
    expect(layoutIndexOf(1, BLACK)).toBe(24);
    expect(layoutIndexOf(19, BLACK)).toBe(6);
  });

  it('maps move ends from the mover’s own numbers', () => {
    // Black's own 24 is White's 1: bottom left for White, bottom right for Black.
    expect(slotOfOrigin(24, 'black', WHITE)).toEqual({ kind: 'point', index: 1 });
    expect(slotOfOrigin(24, 'black', BLACK)).toEqual({ kind: 'point', index: 24 });
    expect(slotOfDestination(13, 'white', WHITE)).toEqual({ kind: 'point', index: 13 });
    expect(slotOfOrigin('bar', 'white', WHITE)).toEqual({ kind: 'bar', side: 'player' });
    expect(slotOfOrigin('bar', 'black', WHITE)).toEqual({ kind: 'bar', side: 'opponent' });
    expect(slotOfDestination('off', 'black', BLACK)).toEqual({ kind: 'tray', side: 'player' });
    expect(slotOfDestination('off', 'black', WHITE)).toEqual({ kind: 'tray', side: 'opponent' });
  });

  it('gives each player a fixed checker style and a side', () => {
    expect(toneOf('white')).toBe('light');
    expect(toneOf('black')).toBe('dark');
    expect(sideOf('white', WHITE)).toBe('player');
    expect(sideOf('white', BLACK)).toBe('opponent');
  });
});

describe('boardStacks', () => {
  it('lists the start position from White’s side', () => {
    const stacks = boardStacks(SAMPLE_POSITIONS.start, WHITE);
    const byPoint = new Map(
      stacks.map((s) => [s.slot.kind === 'point' ? s.slot.index : -1, s.owners]),
    );
    expect(byPoint.get(24)).toEqual(['white', 'white']);
    expect(byPoint.get(13)).toHaveLength(5);
    expect(byPoint.get(6)).toEqual(Array(5).fill('white'));
    expect(byPoint.get(1)).toEqual(['black', 'black']);
    expect(byPoint.get(19)).toEqual(Array(5).fill('black'));
    expect(stacks).toHaveLength(8);
  });

  it('turns the start position for Black: the mover always starts bottom right', () => {
    const stacks = boardStacks(SAMPLE_POSITIONS.start, BLACK);
    const at = (i: number) =>
      stacks.find((s) => s.slot.kind === 'point' && s.slot.index === i)?.owners;
    expect(at(24)).toEqual(['black', 'black']);
    expect(at(6)).toEqual(Array(5).fill('black'));
    expect(at(1)).toEqual(['white', 'white']);
  });

  it('puts a pinned checker under the one that pins it', () => {
    const board = createBoard(
      {
        white: { points: { 24: 1 }, off: 14, pinned: [24] },
        black: { points: { 1: 1 }, off: 14 },
      },
      'contrary',
    );
    const [stack] = boardStacks(board, WHITE);
    expect(stack?.owners).toEqual(['white', 'black']);
  });

  it('counts checkers in a slot', () => {
    const board = SAMPLE_POSITIONS.midgame;
    expect(countIn(board, { kind: 'point', index: 6 }, WHITE)).toBe(7);
    expect(countIn(board, { kind: 'bar', side: 'player' }, WHITE)).toBe(1);
    expect(countIn(board, { kind: 'bar', side: 'opponent' }, WHITE)).toBe(0);
    expect(countIn(board, { kind: 'tray', side: 'opponent' }, WHITE)).toBe(4);
    expect(countIn(board, { kind: 'tray', side: 'player' }, BLACK)).toBe(4);
  });
});

describe('layoutBoard', () => {
  it('draws all 30 checkers of the start position, with no badge', () => {
    const picture = layoutBoard(geo, SAMPLE_POSITIONS.start, WHITE);
    expect(picture.checkers).toHaveLength(30);
    expect(picture.badges).toHaveLength(0);
    expect(picture.trays).toHaveLength(0);
    expect(new Set(picture.checkers.map((c) => c.key)).size).toBe(30);
    expect(picture.checkers.filter((c) => c.owner === 'white')).toHaveLength(15);
  });

  it('puts every checker inside its point', () => {
    const picture = layoutBoard(geo, SAMPLE_POSITIONS.start, BLACK);
    for (const c of picture.checkers) {
      const index = Number(/^p(\d+):/.exec(c.key)?.[1]);
      const r = slotRect(geo, { kind: 'point', index });
      expect(c.x).toBeGreaterThanOrEqual(r.x);
      expect(c.x).toBeLessThanOrEqual(r.x + r.width);
    }
  });

  it('shows 5 checkers and a badge for 7, the bar and the tray', () => {
    const picture = layoutBoard(geo, SAMPLE_POSITIONS.midgame, WHITE);
    expect(picture.checkers.filter((c) => c.key.startsWith('p6:'))).toHaveLength(5);
    expect(picture.badges).toEqual([expect.objectContaining({ key: 'p6', count: 7 })]);
    const bar = picture.checkers.filter((c) => c.key.startsWith('bar:player'));
    expect(bar).toHaveLength(1);
    expect(bar[0]!.r).toBeLessThan(picture.checkers[0]!.r);
    expect(picture.trays).toEqual([
      expect.objectContaining({ owner: 'black', side: 'opponent', rects: expect.any(Array) }),
    ]);
    expect(picture.trays[0]!.rects).toHaveLength(4);
  });

  it('shows both trays in the bear-off', () => {
    const picture = layoutBoard(geo, SAMPLE_POSITIONS.bearoff, BLACK);
    const sides = picture.trays.map((t) => [t.owner, t.side, t.rects.length]);
    expect(sides).toEqual([
      ['white', 'opponent', 6],
      ['black', 'player', 2],
    ]);
  });

  it('names the top checker of a stack', () => {
    expect(topCheckerKey(geo, { kind: 'point', index: 6 }, 3)).toBe('p6:2');
    expect(topCheckerKey(geo, { kind: 'point', index: 6 }, 9)).toBe('p6:4');
    expect(topCheckerKey(geo, { kind: 'point', index: 6 }, 0)).toBeNull();
    expect(topCheckerKey(geo, { kind: 'tray', side: 'player' }, 3)).toBeNull();
  });
});
