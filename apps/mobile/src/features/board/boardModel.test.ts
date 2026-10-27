import { createBoard } from '@tavli/engine';
import { getLayout, getTheme } from '@tavli/themes';

import {
  boardStacks,
  countIn,
  layoutBoard,
  layoutIndexOf,
  pinnedCheckers,
  pinnedIn,
  sideOf,
  slotOfDestination,
  slotOfOrigin,
  toneOf,
  topCheckerKey,
  type BoardView,
} from './boardModel';
import {
  PIN_PEEK,
  fitBoard,
  hitAreas,
  hitTest,
  pinnedCenter,
  slotRect,
  type BoardGeometry,
} from './geometry';
import { SAMPLE_DIRECTIONS, SAMPLE_POSITIONS } from './positions';

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
    // The pinned checker is not in the stack: the stack lies on top of it.
    expect(stack?.owners).toEqual(['black']);
    expect(stack?.pinned).toBe('white');
    const slot = { kind: 'point', index: 24 } as const;
    expect(countIn(board, slot, WHITE)).toBe(1);
    expect(pinnedIn(board, slot, WHITE)).toBe(true);
    expect(pinnedIn(board, { kind: 'point', index: 1 }, WHITE)).toBe(false);
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

describe('Plakoto on the board', () => {
  const board = SAMPLE_POSITIONS.plakotoPins;
  const view: BoardView = { viewer: 'white', direction: SAMPLE_DIRECTIONS.plakotoPins };

  it('starts with 15 on own 24 each: bottom right and bottom left for White', () => {
    const stacks = boardStacks(SAMPLE_POSITIONS.plakotoStart, WHITE);
    expect(stacks.map((s) => [s.slot, s.owners.length, s.pinned])).toEqual([
      [{ kind: 'point', index: 1 }, 15, null],
      [{ kind: 'point', index: 24 }, 15, null],
    ]);
    const picture = layoutBoard(geo, SAMPLE_POSITIONS.plakotoStart, WHITE);
    expect(picture.badges.map((b) => [b.key, b.count])).toEqual([
      ['p1', 15],
      ['p24', 15],
    ]);
    expect(picture.pins).toEqual([]);
  });

  it('lists the pinned checkers in their owner’s numbers', () => {
    expect(pinnedCheckers(board, 'contrary')).toEqual([
      { player: 'black', point: 15 },
      { player: 'white', point: 24 },
    ]);
    expect(pinnedCheckers(SAMPLE_POSITIONS.start, 'contrary')).toEqual([]);
  });

  it('draws a pinned checker under its pinner, peeking out on the base side', () => {
    const picture = layoutBoard(geo, board, view);
    expect(picture.pins.map((p) => [p.key, p.owner, p.pinner])).toEqual([
      ['p10:pinned', 'black', 'white'],
      ['p24:pinned', 'white', 'black'],
    ]);
    // White's mother on 24: one Black checker on top of it.
    const mother = picture.pins.find((p) => p.key === 'p24:pinned')!;
    const slot = { kind: 'point', index: 24 } as const;
    expect({ x: mother.x, y: mother.y }).toEqual(pinnedCenter(geo, slot));
    const onTop = picture.checkers.filter((c) => c.key.startsWith('p24:'));
    expect(onTop.map((c) => [c.key, c.owner])).toEqual([['p24:0', 'black']]);
    const gap = Math.hypot(onTop[0]!.x - mother.x, onTop[0]!.y - mother.y);
    expect(gap).toBeCloseTo(PIN_PEEK * mother.r, 6);
    // The pinned checker stays inside its point.
    const r = slotRect(geo, slot);
    expect(mother.x - mother.r).toBeGreaterThanOrEqual(r.x - 1e-6);
    expect(mother.x + mother.r).toBeLessThanOrEqual(r.x + r.width + 1e-6);
    // Two White pinners on Black's 15 (White 10).
    const pinners = picture.checkers.filter((c) => c.key.startsWith('p10:'));
    expect(pinners.map((c) => c.owner)).toEqual(['white', 'white']);
    // 30 checkers: 28 in stacks, 2 pinned.
    expect(picture.checkers.length + picture.pins.length).toBe(30);
  });

  it('turns the pins with the board (Black’s view)', () => {
    const picture = layoutBoard(geo, board, { viewer: 'black', direction: 'contrary' });
    expect(picture.pins.map((p) => [p.key, p.owner])).toEqual([
      ['p15:pinned', 'black'],
      ['p1:pinned', 'white'],
    ]);
  });

  it('never uses the bar', () => {
    const picture = layoutBoard(geo, board, view);
    expect(picture.checkers.some((c) => c.key.startsWith('bar:'))).toBe(false);
  });
});

describe('Fevga on the board', () => {
  const start = SAMPLE_POSITIONS.fevgaStart;
  const PARALLEL_WHITE: BoardView = { viewer: 'white', direction: 'parallel' };
  const PARALLEL_BLACK: BoardView = { viewer: 'black', direction: 'parallel' };

  it('starts both players on own 24, in diagonally opposite corners', () => {
    expect(SAMPLE_DIRECTIONS.fevgaStart).toBe('parallel');
    const at = (v: BoardView) =>
      boardStacks(start, v)
        .map((s) => [s.slot, s.owners[0], s.owners.length] as const)
        .sort((a, b) =>
          a[0].kind === 'point' && b[0].kind === 'point' ? a[0].index - b[0].index : 0,
        );
    expect(at(PARALLEL_WHITE)).toEqual([
      [{ kind: 'point', index: 12 }, 'black', 15],
      [{ kind: 'point', index: 24 }, 'white', 15],
    ]);
    expect(at(PARALLEL_BLACK)).toEqual([
      [{ kind: 'point', index: 12 }, 'white', 15],
      [{ kind: 'point', index: 24 }, 'black', 15],
    ]);
  });

  it('moves both players the same way round the board', () => {
    for (const v of [PARALLEL_WHITE, PARALLEL_BLACK]) {
      for (const mover of ['white', 'black'] as const) {
        // Own 24 → 1 in layout numbers: each step is one point on, round the board.
        const path = Array.from({ length: 24 }, (_, k) => {
          const slot = slotOfOrigin(24 - k, mover, v);
          return slot.kind === 'point' ? slot.index : -1;
        });
        for (let k = 1; k < 24; k++) {
          expect((path[k - 1]! - path[k]! + 24) % 24).toBe(1);
        }
      }
    }
    // The viewer starts on layout 24, the other player on layout 12.
    expect(slotOfOrigin(24, 'black', PARALLEL_WHITE)).toEqual({ kind: 'point', index: 12 });
    expect(slotOfDestination(1, 'black', PARALLEL_WHITE)).toEqual({ kind: 'point', index: 13 });
  });

  for (const layoutId of ['portrait-rotated', 'landscape'] as const) {
    it(`draws and hit-tests the start in ${layoutId}`, () => {
      const landscape = layoutId === 'landscape';
      const g: BoardGeometry = fitBoard(getLayout(getTheme('walnut-kafeneio'), layoutId), {
        width: landscape ? 844 : 377,
        height: landscape ? 390 : 630,
      });
      const picture = layoutBoard(g, start, PARALLEL_WHITE);
      const mid = (index: number) => {
        const r = slotRect(g, { kind: 'point', index });
        return {
          x: r.x + r.width / 2 - (g.x + g.width / 2),
          y: r.y + r.height / 2 - (g.y + g.height / 2),
        };
      };
      // Diagonally opposite: different halves across and along the board.
      expect(Math.sign(mid(24).x)).toBe(-Math.sign(mid(12).x));
      expect(Math.sign(mid(24).y)).toBe(-Math.sign(mid(12).y));
      // Every drawn checker hit-tests to the point it is drawn on.
      const areas = hitAreas(g);
      for (const c of picture.checkers) {
        const index = Number(/^p(\d+):/.exec(c.key)?.[1]);
        expect(hitTest(areas, c.x, c.y)).toEqual({ kind: 'point', index });
      }
      expect(picture.checkers.filter((c) => c.owner === 'white')).toHaveLength(5);
      expect(picture.badges.map((b) => b.count)).toEqual([15, 15]);
    });
  }
});
