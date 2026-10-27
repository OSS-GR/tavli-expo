import {
  applyGameAction,
  applyMoveToBoard,
  createBoard,
  createGameFlow,
  currentBoard,
  legalNextMoves,
  portes,
  type BoardState,
  type GameFlow,
  type Move,
} from '@tavli/engine';
import { getLayout, getTheme } from '@tavli/themes';

import { layoutBoard, type BoardView } from './boardModel';
import { moveFlights, HIT_DELAY_MS } from './flights';
import { fitBoard, slotRect, stackPosition, type ScreenRect } from './geometry';
import {
  SNAP_DISTANCE,
  buildSources,
  pickSource,
  pickTarget,
  resolveDrop,
  resolveTap,
  type MovableSource,
} from './interaction';

const layout = getLayout(getTheme('walnut-kafeneio'), 'portrait-rotated');
const geo = fitBoard(layout, { width: 377, height: 630 });
const WHITE: BoardView = { viewer: 'white', direction: 'contrary' };
const BLACK: BoardView = { viewer: 'black', direction: 'contrary' };

const center = (r: ScreenRect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** White to move with these dice, on the Portes start or on `board`. */
function whiteToMove(dice: [1 | 2 | 3 | 4 | 5 | 6, 1 | 2 | 3 | 4 | 5 | 6], board?: BoardState) {
  const start = portes.initialState({ startingPlayer: 'white' });
  const state = board ? { ...start, board } : start;
  const flow: GameFlow = createGameFlow({ state, starter: 'white' });
  return applyGameAction(flow, { type: 'roll', player: 'white', dice });
}

function sourcesFor(flow: GameFlow, view = WHITE): MovableSource[] {
  return buildSources(geo, currentBoard(flow), view, 'white', legalNextMoves(flow));
}

const source = (sources: MovableSource[], key: string) => {
  const s = sources.find((q) => q.key === key);
  if (!s) throw new Error(`no source ${key}`);
  return s;
};

describe('buildSources', () => {
  const flow = whiteToMove([6, 1]);
  const sources = sourcesFor(flow);

  it('lists every checker that can move, at its top checker', () => {
    expect(sources.map((s) => s.key).sort()).toEqual(['p13', 'p24', 'p6', 'p8']);
    const picture = layoutBoard(geo, currentBoard(flow), WHITE);
    const s13 = source(sources, 'p13');
    expect(s13.checker.key).toBe('p13:4');
    const drawn = picture.checkers.find((c) => c.key === 'p13:4')!;
    expect([s13.checker.x, s13.checker.y]).toEqual([drawn.x, drawn.y]);
  });

  it('touches the same rects that draw the points', () => {
    const s13 = source(sources, 'p13');
    expect(s13.rect).toEqual(slotRect(geo, { kind: 'point', index: 13 }));
    const to7 = s13.targets.find((t) => t.key === 'p7')!;
    expect(to7.rect).toEqual(slotRect(geo, { kind: 'point', index: 7 }));
    expect(to7.move).toMatchObject({ from: 13, to: 7, die: 6 });
    // An empty point: the ghost checker sits at the base.
    expect(to7.landing).toEqual(stackPosition(geo, { kind: 'point', index: 7 }, 1, 0));
  });

  it('puts the ghost on top of own checkers', () => {
    const s8 = source(sources, 'p8');
    const to7 = s8.targets.find((t) => t.key === 'p7')!;
    expect(to7.move.die).toBe(1);
    // 6/5: point 5 is empty, so the ghost sits at the base.
    const to5 = source(sources, 'p6').targets.find((t) => t.key === 'p5')!;
    expect(to5.landing).toEqual(stackPosition(geo, { kind: 'point', index: 5 }, 1, 0));
    // 24/18 with the 6: Black has nothing there.
    const to18 = source(sources, 'p24').targets.find((t) => t.key === 'p18')!;
    expect(to18.move.die).toBe(6);
    // 13/12 lands on Black's 5-stack: blocked, so not a target.
    expect(source(sources, 'p13').targets.map((t) => t.key)).not.toContain('p12');
  });

  it('uses the mirrored rects in Black’s view (flip)', () => {
    const mirrored = sourcesFor(flow, BLACK);
    // White's 13 is Black's 12 from the bottom player's side.
    const s = source(mirrored, 'p12');
    expect(s.rect).toEqual(slotRect(geo, { kind: 'point', index: 12 }));
  });

  it('bears off into the tray with the lower die when two dice reach it', () => {
    const board = createBoard(
      { white: { points: { 2: 1, 1: 1 }, off: 13 }, black: { points: { 1: 15 } } },
      'contrary',
    );
    const bear = whiteToMove([5, 2], board);
    const s2 = source(sourcesFor(bear), 'p2');
    const off = s2.targets.find((t) => t.key === 'tray:player')!;
    expect(off.move).toMatchObject({ from: 2, to: 'off', die: 2 });
    expect(off.rect).toEqual(slotRect(geo, { kind: 'tray', side: 'player' }));
  });

  it('starts from the bar when a checker must enter', () => {
    const board = createBoard(
      { white: { points: { 6: 14 }, bar: 1 }, black: { points: { 6: 15 } } },
      'contrary',
    );
    const enter = sourcesFor(whiteToMove([3, 4], board));
    expect(enter.map((s) => s.key)).toEqual(['bar:player']);
    expect(enter[0]!.checker.r).toBeLessThan(geo.width * layout.checker.radius);
  });
});

describe('picking', () => {
  const sources = sourcesFor(whiteToMove([6, 1]));
  const s13 = sources.findIndex((s) => s.key === 'p13');
  const s8 = sources.findIndex((s) => s.key === 'p8');
  const target7 = sources[s13]!.targets.findIndex((t) => t.key === 'p7');

  it('finds a source under the finger, or near it', () => {
    const c = center(sources[s13]!.rect);
    expect(pickSource(sources, c.x, c.y)).toBe(s13);
    expect(pickSource(sources, -50, -50)).toBe(-1);
  });

  it('finds a target of the picked source', () => {
    const c = center(sources[s13]!.targets[target7]!.rect);
    expect(pickTarget(sources[s13]!, c.x, c.y)).toBe(target7);
  });

  it('tap-tap: select, then move to a target', () => {
    const from = center(sources[s13]!.rect);
    expect(resolveTap(sources, null, from.x, from.y)).toEqual({ kind: 'select', source: s13 });
    const to = center(sources[s13]!.targets[target7]!.rect);
    expect(resolveTap(sources, s13, to.x, to.y)).toEqual({
      kind: 'move',
      source: s13,
      target: target7,
    });
  });

  it('tap-tap: a tap on another movable checker selects it', () => {
    const c13 = center(sources[s13]!.rect);
    expect(resolveTap(sources, s8, c13.x, c13.y)).toEqual({ kind: 'select', source: s13 });
  });

  it('tap-tap: a target wins over a movable checker that sits on it', () => {
    // With 5-2, 13/8 lands on 8, and the checkers on 8 can move too.
    const five = sourcesFor(whiteToMove([5, 2]));
    const from = five.findIndex((s) => s.key === 'p13');
    const to8 = five[from]!.targets.findIndex((t) => t.key === 'p8');
    expect(five.some((s) => s.key === 'p8')).toBe(true);
    const c8 = center(slotRect(geo, { kind: 'point', index: 8 }));
    expect(resolveTap(five, from, c8.x, c8.y)).toEqual({ kind: 'move', source: from, target: to8 });
  });

  it('tap-tap: a second tap on the selected checker, or off the board, drops it', () => {
    const c = center(sources[s13]!.rect);
    expect(resolveTap(sources, s13, c.x, c.y)).toEqual({ kind: 'deselect' });
    expect(resolveTap(sources, s13, -100, -100)).toEqual({ kind: 'deselect' });
  });

  it('tap-tap: snaps to a target a little outside its rect', () => {
    const r = sources[s13]!.targets[target7]!.rect;
    const nearX = r.x + r.width / 2;
    // Just past the far (inner) end of point 7, in the gap between the columns.
    const nearY = r.y + r.height / 2;
    const result = resolveTap(sources, s13, nearX, nearY, SNAP_DISTANCE);
    expect(result).toMatchObject({ kind: 'move', target: target7 });
  });

  it('drop: on a target moves, on the source cancels, elsewhere is illegal', () => {
    const to = center(sources[s13]!.targets[target7]!.rect);
    expect(resolveDrop(sources, s13, to.x, to.y)).toEqual({ kind: 'move', target: target7 });
    const home = center(sources[s13]!.rect);
    expect(resolveDrop(sources, s13, home.x, home.y)).toEqual({ kind: 'cancel' });
    const p12 = center(slotRect(geo, { kind: 'point', index: 12 }));
    expect(resolveDrop(sources, s13, p12.x, p12.y)).toEqual({ kind: 'illegal' });
  });
});

describe('moveFlights', () => {
  it('flies a moved checker from its stack to its landing place', () => {
    const before = portes.initialState({ startingPlayer: 'white' }).board;
    const move: Move = { from: 13, to: 7, die: 6, capture: 'none' };
    const after = applyMoveToBoard(before, 'white', move, 'contrary');
    const [f, ...rest] = moveFlights(geo, WHITE, 'white', move, before, after, { id: 'a' });
    expect(rest).toEqual([]);
    expect(f).toMatchObject({ id: 'a:0', owner: 'white', hide: 'p7:0', delay: 0 });
    expect(f!.from).toMatchObject(stackPosition(geo, { kind: 'point', index: 13 }, 5, 4));
    expect(f!.to).toMatchObject(stackPosition(geo, { kind: 'point', index: 7 }, 1, 0));
  });

  it('starts a dropped checker at the drop point', () => {
    const before = portes.initialState({ startingPlayer: 'white' }).board;
    const move: Move = { from: 13, to: 7, die: 6, capture: 'none' };
    const after = applyMoveToBoard(before, 'white', move, 'contrary');
    const [f] = moveFlights(geo, WHITE, 'white', move, before, after, {
      id: 'a',
      from: { x: 10, y: 20 },
    });
    expect(f!.from).toEqual({ x: 10, y: 20 });
  });

  it('sends a hit checker to the bar, a moment later', () => {
    // Black's own 18 is White's 7: 13/7* hits it.
    const board = createBoard(
      { white: { points: { 13: 15 } }, black: { points: { 18: 1, 1: 14 } } },
      'contrary',
    );
    const move: Move = { from: 13, to: 7, die: 6, capture: 'hit' };
    const after = applyMoveToBoard(board, 'white', move, 'contrary');
    const flights = moveFlights(geo, WHITE, 'white', move, board, after, { id: 'h' });
    expect(flights).toHaveLength(2);
    const [, hit] = flights;
    expect(hit).toMatchObject({ owner: 'black', delay: HIT_DELAY_MS, hide: 'bar:opponent:0' });
    expect(hit!.from).toMatchObject(stackPosition(geo, { kind: 'point', index: 7 }, 1, 0));
    expect(hit!.toR).toBeLessThan(hit!.fromR);
  });

  it('flies back on undo, and brings a hit checker back from the bar', () => {
    const board = createBoard(
      { white: { points: { 13: 15 } }, black: { points: { 18: 1, 1: 14 } } },
      'contrary',
    );
    const move: Move = { from: 13, to: 7, die: 6, capture: 'hit' };
    const played = applyMoveToBoard(board, 'white', move, 'contrary');
    const flights = moveFlights(geo, WHITE, 'white', move, played, board, { id: 'u', undo: true });
    expect(flights).toHaveLength(2);
    const [back, victim] = flights;
    expect(back!.from).toMatchObject(stackPosition(geo, { kind: 'point', index: 7 }, 1, 0));
    expect(back!.hide).toBeNull(); // 13 holds 15: the top place is under the badge
    expect(victim).toMatchObject({ owner: 'black', hide: 'p7:0', delay: 0 });
  });
});
