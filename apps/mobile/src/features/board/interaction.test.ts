import {
  applyGameAction,
  applyMoveToBoard,
  createBoard,
  createGameFlow,
  currentBoard,
  legalNextMoves,
  plakoto,
  portes,
  resolveRules,
  type BoardState,
  type GameFlow,
  type Move,
} from '@tavli/engine';
import { getLayout, getTheme } from '@tavli/themes';

import { boardLayout, portraitLayout } from './BoardCanvas';
import { layoutBoard, type BoardView } from './boardModel';
import { flowPaths } from './combined';
import {
  FLIGHT_MS,
  HIT_DELAY_MS,
  TURN_MOVE_GAP_MS,
  flightMs,
  moveFlights,
  pathFlights,
  turnFlights,
} from './flights';
import {
  fitBoard,
  fitBoardWithShadow,
  slotRect,
  stackPosition,
  type BoardGeometry,
  type ScreenRect,
} from './geometry';
import {
  BOARD_GESTURES,
  SNAP_DISTANCE,
  TAP_MAX_MS,
  TAP_SLOP,
  buildSources,
  dragPoint,
  panEnd,
  pickSource,
  pickTarget,
  resolveDrop,
  resolveTap,
  type MovableSource,
} from './interaction';
import { flightPose } from './skia/MovingCheckers';

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

describe('tap or drag (#174)', () => {
  it('starts a drag exactly where a tap stops', () => {
    // The pan activates at a move of minDistance; the tap fails above
    // maxDistance. Equal values: no touch fires both, and none falls between.
    expect(BOARD_GESTURES.pan.minDistance).toBe(TAP_SLOP);
    expect(BOARD_GESTURES.tap.maxDistance).toBe(TAP_SLOP);
  });

  it('lets a slow press count as a tap', () => {
    // Gesture Handler's own limit is 500 ms; a slow press is longer.
    expect(BOARD_GESTURES.tap.maxDuration).toBe(TAP_MAX_MS);
    expect(TAP_MAX_MS).toBeGreaterThan(1000);
  });

  it('reads the end of the pan', () => {
    expect(panEnd(true, false)).toBe('drop');
    expect(panEnd(true, true)).toBe('cancel');
    // The pan never dragged: the finger stayed put (the pan FAILED, so
    // canceled is true) or it swiped off a checker. The tap decides.
    expect(panEnd(false, true)).toBe('none');
    expect(panEnd(false, false)).toBe('none');
  });

  it('moves the dragged checker as far as the finger moved', () => {
    const checker = { x: 100, y: 200 };
    expect(dragPoint(checker, { x: 105, y: 198 }, { x: 105, y: 198 })).toEqual(checker);
    expect(dragPoint(checker, { x: 105, y: 198 }, { x: 90, y: 230 })).toEqual({ x: 85, y: 232 });
  });
});

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

describe('turnFlights (#255)', () => {
  it('flies the moves of a whole turn one after the other', () => {
    const before = portes.initialState({ startingPlayer: 'white' }).board;
    const moves: Move[] = [
      { from: 13, to: 7, die: 6, capture: 'none' },
      { from: 7, to: 2, die: 5, capture: 'none' },
    ];
    const flights = turnFlights(geo, WHITE, 'white', moves, before, {
      id: 'r',
      direction: 'contrary',
    });
    expect(flights.map((f) => [f.id, f.delay])).toEqual([
      ['r:0:0', 0],
      ['r:1:0', FLIGHT_MS + TURN_MOVE_GAP_MS],
    ]);
    // The second move starts where the first one landed.
    expect(flights[1]!.from).toEqual(flights[0]!.to);
    expect(flights[1]!.to).toMatchObject(stackPosition(geo, { kind: 'point', index: 2 }, 1, 0));
    // It is the same checker: it shows there only once the first flight is down.
    expect(flights[0]!.hiddenMs).toBeUndefined();
    expect(flights[1]!.hiddenMs).toBe(FLIGHT_MS);
  });

  it('hides each later move of one checker until it lands (a double)', () => {
    const before = portes.initialState({ startingPlayer: 'white' }).board;
    const moves: Move[] = [
      { from: 13, to: 11, die: 2, capture: 'none' },
      { from: 11, to: 9, die: 2, capture: 'none' },
      { from: 9, to: 7, die: 2, capture: 'none' },
      { from: 13, to: 11, die: 2, capture: 'none' },
    ];
    const flights = turnFlights(geo, WHITE, 'white', moves, before, {
      id: 'r',
      direction: 'contrary',
    });
    const step = FLIGHT_MS + TURN_MOVE_GAP_MS;
    expect(flights.map((f) => [f.delay, f.hiddenMs])).toEqual([
      [0, undefined],
      [step, FLIGHT_MS],
      [2 * step, step + FLIGHT_MS],
      // Another checker: it waits in sight at its start.
      [3 * step, undefined],
    ]);
  });

  it('sends a hit checker to the bar after its own move lands', () => {
    const board = createBoard(
      { white: { points: { 13: 15 } }, black: { points: { 18: 1, 1: 14 } } },
      'contrary',
    );
    const moves: Move[] = [
      { from: 13, to: 12, die: 1, capture: 'none' },
      { from: 13, to: 7, die: 6, capture: 'hit' },
    ];
    const flights = turnFlights(geo, WHITE, 'white', moves, board, {
      id: 'r',
      direction: 'contrary',
    });
    expect(flights.map((f) => [f.id, f.owner, f.delay])).toEqual([
      ['r:0:0', 'white', 0],
      ['r:1:0', 'white', FLIGHT_MS + TURN_MOVE_GAP_MS],
      ['r:1:1', 'black', FLIGHT_MS + TURN_MOVE_GAP_MS + HIT_DELAY_MS],
    ]);
    // Two checkers and a blot: each waits in sight where it stands.
    expect(flights.map((f) => f.hiddenMs)).toEqual([undefined, undefined, undefined]);
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

  // #179: after a hit, the hitter must still be touchable on its new point,
  // where it is drawn and where its flight lands. Only it and the bar hide.
  it.each([
    ['White', WHITE],
    ['Black (flip)', BLACK],
  ])('keeps the hitter a source on its new point (%s view)', (_, view) => {
    // White's door on 13; a Black blot on White's 8 (Black's 17).
    const board = createBoard(
      { white: { points: { 13: 2, 6: 13 } }, black: { points: { 17: 1, 24: 14 } } },
      'contrary',
    );
    const flow = whiteToMove([5, 3], board);
    const hit = source(sourcesFor(flow, view), view === WHITE ? 'p13' : 'p12');
    const to8 = hit.targets.find((t) => t.move.to === 8)!;
    expect(to8.move).toMatchObject({ from: 13, die: 5, capture: 'hit' });

    const before = currentBoard(flow);
    const played = applyGameAction(flow, { type: 'move', player: 'white', move: to8.move });
    const after = currentBoard(played);
    const sources = sourcesFor(played, view);
    const hitter = source(sources, to8.key);
    expect(hitter.targets.map((t) => t.move)).toContainEqual(
      expect.objectContaining({ from: 8, to: 5, die: 3 }),
    );
    // The other checker of the door can still move too.
    expect(sources.map((s) => s.key)).toContain(hit.key);

    // The hitter is drawn under its key, where the touch finds it.
    const drawn = layoutBoard(geo, after, view).checkers.find((c) => c.key === hitter.checker.key);
    expect(drawn).toMatchObject({ owner: 'white', x: hitter.checker.x, y: hitter.checker.y });
    expect(pickSource(sources, hitter.checker.x, hitter.checker.y)).toBe(sources.indexOf(hitter));

    // The flights hide the hitter (until it lands) and the bar top, nothing else.
    const [mover, victim] = moveFlights(geo, view, 'white', to8.move, before, after, { id: 'h' });
    expect(mover!.hide).toBe(hitter.checker.key);
    expect(mover!.to).toMatchObject({ x: hitter.checker.x, y: hitter.checker.y });
    expect(victim!.hide).toMatch(/^bar:/);
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

describe('Plakoto: pins on the board', () => {
  const rules = resolveRules('plakoto', { match: { rotation: ['plakoto'] } });
  // A Black blot on White 5 (Black's 20). White has 2 on 8 and 13 on 24.
  const board = createBoard(
    {
      white: { points: { 24: 13, 8: 2 } },
      black: { points: { 24: 14, 20: 1 } },
    },
    'contrary',
  );
  const p5 = { kind: 'point', index: 5 } as const;
  const rolled = () => {
    const state = { ...plakoto.initialState({ startingPlayer: 'white', rules }), board };
    const flow = createGameFlow({ state, starter: 'white' });
    return applyGameAction(flow, { type: 'roll', player: 'white', dice: [3, 1] });
  };

  it('lands a pin on top of the blot, which then peeks out under it', () => {
    const flow = rolled();
    const to5 = source(sourcesFor(flow), 'p8').targets.find((t) => t.key === 'p5')!;
    expect(to5.move.capture).toBe('pin');
    expect(to5.landing).toEqual(stackPosition(geo, p5, 1, 0, true));

    const played = applyGameAction(flow, { type: 'move', player: 'white', move: to5.move });
    const picture = layoutBoard(geo, currentBoard(played), WHITE);
    const pinner = picture.checkers.find((c) => c.key === 'p5:0')!;
    expect({ x: pinner.x, y: pinner.y }).toEqual(to5.landing);
    expect(picture.pins).toEqual([expect.objectContaining({ key: 'p5:pinned', owner: 'black' })]);
  });

  it('flies the pinner only: no checker goes to the bar', () => {
    const flow = rolled();
    const move = source(sourcesFor(flow), 'p8').targets.find((t) => t.key === 'p5')!.move;
    const before = currentBoard(flow);
    const after = applyMoveToBoard(before, 'white', move, 'contrary');
    const flights = moveFlights(geo, WHITE, 'white', move, before, after, { id: 'p' });
    expect(flights).toHaveLength(1);
    expect(flights[0]).toMatchObject({ owner: 'white', hide: 'p5:0' });
    expect(flights[0]!.to).toMatchObject(stackPosition(geo, p5, 1, 0, true));
    // Undo: the pinner flies back from its place on top of the blot.
    const back = moveFlights(geo, WHITE, 'white', move, after, before, { id: 'u', undo: true });
    expect(back).toHaveLength(1);
    expect(back[0]!.from).toMatchObject(stackPosition(geo, p5, 1, 0, true));
  });

  it('lets the pinner move away from where it is drawn; the pinned checker never moves', () => {
    const flow = rolled();
    const pin = source(sourcesFor(flow), 'p8').targets.find((t) => t.key === 'p5')!.move;
    const played = applyGameAction(flow, { type: 'move', player: 'white', move: pin });
    const sources = sourcesFor(played);
    const from5 = source(sources, 'p5');
    expect(from5.checker.key).toBe('p5:0');
    expect({ x: from5.checker.x, y: from5.checker.y }).toEqual(stackPosition(geo, p5, 1, 0, true));
    // The pinned Black checker under it is never a source.
    expect(sources.every((s) => s.checker.key !== 'p5:pinned')).toBe(true);
  });
});

// Settings → Home board: bottom left (#175). Same moves, mirrored places.
describe('home board on the bottom left (mirrored layout)', () => {
  const mirrored = fitBoard(portraitLayout(getTheme('walnut-kafeneio'), 'left'), {
    width: 377,
    height: 630,
  });
  const flipX = (x: number) => 2 * geo.x + geo.width - x;
  const flow = whiteToMove([6, 1]);
  const normal = sourcesFor(flow);
  const flipped = buildSources(mirrored, currentBoard(flow), WHITE, 'white', legalNextMoves(flow));

  it('gives the same sources and targets, at mirrored places', () => {
    expect(flipped.map((s) => s.key)).toEqual(normal.map((s) => s.key));
    flipped.forEach((s, i) => {
      const n = normal[i]!;
      expect(s.checker.x).toBeCloseTo(flipX(n.checker.x), 6);
      expect(s.checker.y).toBeCloseTo(n.checker.y, 6);
      expect(s.rect.x).toBeCloseTo(flipX(n.rect.x + n.rect.width), 6);
      expect(s.targets.map((t) => t.move)).toEqual(n.targets.map((t) => t.move));
      s.targets.forEach((t, j) => {
        expect(t.landing.x).toBeCloseTo(flipX(n.targets[j]!.landing.x), 6);
      });
    });
  });

  it('tap-tap: selects 13 and moves it to 7 at their mirrored places', () => {
    const s13 = flipped.findIndex((s) => s.key === 'p13');
    const target7 = flipped[s13]!.targets.findIndex((t) => t.key === 'p7');
    const from = center(slotRect(mirrored, { kind: 'point', index: 13 }));
    // Point 13 now sits at the top left.
    expect(from.x).toBeLessThan(mirrored.x + mirrored.width / 2);
    expect(resolveTap(flipped, null, from.x, from.y)).toEqual({ kind: 'select', source: s13 });
    const to = center(slotRect(mirrored, { kind: 'point', index: 7 }));
    expect(resolveTap(flipped, s13, to.x, to.y)).toEqual({
      kind: 'move',
      source: s13,
      target: target7,
    });
    // A drop where 7 sits on the normal board is point 18: not a target.
    const old7 = center(slotRect(geo, { kind: 'point', index: 7 }));
    expect(resolveDrop(flipped, s13, old7.x, old7.y)).toEqual({ kind: 'illegal' });
  });

  it('works with the pass-and-play flip (Black at the bottom)', () => {
    const black = buildSources(mirrored, currentBoard(flow), BLACK, 'white', legalNextMoves(flow));
    // White's 13 is Black's 12 from the bottom player's side.
    const s = source(black, 'p12');
    expect(s.rect).toEqual(slotRect(mirrored, { kind: 'point', index: 12 }));
    expect(s.rect.x).toBeGreaterThan(mirrored.x + mirrored.width / 2 - 1);
  });

  it('flies moves and hits between the mirrored places', () => {
    const board = createBoard(
      { white: { points: { 13: 15 } }, black: { points: { 18: 1, 1: 14 } } },
      'contrary',
    );
    const move: Move = { from: 13, to: 7, die: 6, capture: 'hit' };
    const after = applyMoveToBoard(board, 'white', move, 'contrary');
    const plain = moveFlights(geo, WHITE, 'white', move, board, after, { id: 'h' });
    const mirror = moveFlights(mirrored, WHITE, 'white', move, board, after, { id: 'h' });
    expect(mirror).toHaveLength(2);
    mirror.forEach((f, i) => {
      const p = plain[i]!;
      expect(f.hide).toBe(p.hide);
      expect(f.from.x).toBeCloseTo(flipX(p.from.x), 6);
      expect(f.to.x).toBeCloseTo(flipX(p.to.x), 6);
      expect(f.to.y).toBeCloseTo(p.to.y, 6);
    });
  });

  it('bears off into your tray at the bottom right', () => {
    const board = createBoard(
      { white: { points: { 2: 1, 1: 1 }, off: 13 }, black: { points: { 1: 15 } } },
      'contrary',
    );
    const bear = whiteToMove([5, 2], board);
    const sources = buildSources(
      mirrored,
      currentBoard(bear),
      WHITE,
      'white',
      legalNextMoves(bear),
    );
    const off = source(sources, 'p2').targets.find((t) => t.key === 'tray:player')!;
    expect(off.rect).toEqual(slotRect(mirrored, { kind: 'tray', side: 'player' }));
    expect(off.rect.x).toBeGreaterThan(mirrored.x + mirrored.width / 2 - 1);
  });
});

// #180: one checker with several dice. The "2+3" targets come after the
// single targets of their source and carry every step.
describe('combined targets (#180)', () => {
  // White's door on 13 and 13 on 6. Black has a blot on White's 8 (Black's 17).
  const door = createBoard(
    { white: { points: { 13: 2, 6: 13 } }, black: { points: { 17: 1, 24: 14 } } },
    'contrary',
  );
  const flow = whiteToMove([5, 3], door);
  const withPaths = (g = geo, view = WHITE) =>
    buildSources(g, currentBoard(flow), view, 'white', legalNextMoves(flow), flowPaths(flow));

  it('adds 13/10/5 after the single targets of 13, with both steps', () => {
    const s13 = source(withPaths(), 'p13');
    expect(s13.targets.map((t) => t.key)).toEqual(['p8', 'p10', 'p5']);
    const to5 = s13.targets[2]!;
    expect(to5.moves).toEqual([
      { from: 13, to: 10, die: 3, capture: 'none' },
      { from: 10, to: 5, die: 5, capture: 'none' },
    ]);
    expect(to5.move).toBe(to5.moves[0]);
    expect(to5.rect).toEqual(slotRect(geo, { kind: 'point', index: 5 }));
    // Point 5 is empty: the ghost lands as its first checker.
    expect(to5.landing).toEqual(stackPosition(geo, { kind: 'point', index: 5 }, 1, 0));
    // Single targets keep one move.
    expect(s13.targets[0]!.moves).toEqual([s13.targets[0]!.move]);
    // Without paths nothing changes.
    expect(source(sourcesFor(flow), 'p13').targets.map((t) => t.key)).toEqual(['p8', 'p10']);
  });

  it('plays the combined target by tap and by drop', () => {
    const sources = withPaths();
    const s13 = sources.findIndex((s) => s.key === 'p13');
    const at5 = center(slotRect(geo, { kind: 'point', index: 5 }));
    expect(resolveTap(sources, s13, at5.x, at5.y)).toEqual({
      kind: 'move',
      source: s13,
      target: 2,
    });
    expect(resolveDrop(sources, s13, at5.x, at5.y)).toEqual({ kind: 'move', target: 2 });
  });

  it.each([
    ['White', WHITE],
    ['Black (flip)', BLACK],
  ])('works on the mirrored board (%s view)', (_, view) => {
    const mirrored = fitBoard(portraitLayout(getTheme('walnut-kafeneio'), 'left'), {
      width: 377,
      height: 630,
    });
    const flipX = (x: number) => 2 * geo.x + geo.width - x;
    const plain = withPaths(geo, view);
    const flipped = withPaths(mirrored, view);
    const key = view === WHITE ? 'p13' : 'p12';
    const a = source(plain, key);
    const b = source(flipped, key);
    expect(b.targets.map((t) => t.moves)).toEqual(a.targets.map((t) => t.moves));
    const to5 = b.targets[2]!;
    expect(to5.landing.x).toBeCloseTo(flipX(a.targets[2]!.landing.x), 6);
    const i = flipped.indexOf(b);
    const at = center(to5.rect);
    expect(resolveTap(flipped, i, at.x, at.y)).toEqual({ kind: 'move', source: i, target: 2 });
  });

  it('flies one checker through the middle point, and the hit checker when it gets there', () => {
    const steps: Move[] = [
      { from: 13, to: 8, die: 5, capture: 'hit' },
      { from: 8, to: 5, die: 3, capture: 'none' },
    ];
    const mid = applyMoveToBoard(door, 'white', steps[0]!, 'contrary');
    const end = applyMoveToBoard(mid, 'white', steps[1]!, 'contrary');
    const flights = pathFlights(geo, WHITE, 'white', steps, door, {
      id: 'p',
      direction: 'contrary',
    });
    expect(flights).toHaveLength(2);
    const [mover, victim] = flights;
    const [leg1] = moveFlights(geo, WHITE, 'white', steps[0]!, door, mid, { id: 'a' });
    const [leg2] = moveFlights(geo, WHITE, 'white', steps[1]!, mid, end, { id: 'b' });
    // The mover: from 13, through 8, to 5. Hidden on 5 until it lands.
    expect(mover).toMatchObject({ owner: 'white', from: leg1!.from, to: leg2!.to, delay: 0 });
    expect(mover!.hide).toBe(leg2!.hide);
    expect(mover!.via).toEqual([{ x: leg1!.to.x, y: leg1!.to.y, r: leg1!.toR }]);
    expect(flightMs(mover!)).toBe(2 * FLIGHT_MS);
    // The hit Black checker leaves 8 as the mover gets there (first leg).
    expect(victim).toMatchObject({ owner: 'black', delay: HIT_DELAY_MS, hide: 'bar:opponent:0' });

    // Undo: the same path backwards; the hit checker comes back as the mover passes 8.
    const [home, comeBack] = pathFlights(geo, WHITE, 'white', steps, door, {
      id: 'u',
      direction: 'contrary',
      undo: true,
    });
    expect(home).toMatchObject({ from: leg2!.to, to: leg1!.from, delay: 0 });
    expect(home!.via).toEqual([{ x: leg1!.to.x, y: leg1!.to.y, r: leg1!.toR }]);
    expect(home!.hide).toBe(source(sourcesFor(flow), 'p13').checker.key);
    expect(comeBack).toMatchObject({ owner: 'black', delay: FLIGHT_MS });
    expect(comeBack!.to).toMatchObject(stackPosition(geo, { kind: 'point', index: 8 }, 1, 0));
  });

  it('starts a dropped path at the drop point', () => {
    const steps: Move[] = [
      { from: 13, to: 10, die: 3, capture: 'none' },
      { from: 10, to: 5, die: 5, capture: 'none' },
    ];
    const [mover] = pathFlights(geo, WHITE, 'white', steps, door, {
      id: 'd',
      direction: 'contrary',
      from: { x: 3, y: 4 },
    });
    expect(mover!.from).toEqual({ x: 3, y: 4 });
    expect(mover!.via).toHaveLength(1);
  });

  it('stops on each middle point: one leg per die', () => {
    const flight = {
      id: 'f',
      owner: 'white' as const,
      from: { x: 0, y: 0 },
      to: { x: 200, y: 0 },
      fromR: 10,
      toR: 10,
      hide: null,
      delay: 0,
      via: [{ x: 100, y: 50, r: 10 }],
    };
    expect(flightPose(flight, 0)).toMatchObject({ x: 0, y: 0, r: 10 });
    // Half way in time: on the middle point, at rest (no lift).
    expect(flightPose(flight, 0.5)).toMatchObject({ x: 100, y: 50, r: 10 });
    expect(flightPose(flight, 1)).toMatchObject({ x: 200, y: 0, r: 10 });
    // Each leg slows down at its end: past its middle in half its time.
    expect(flightPose(flight, 0.25).x).toBeGreaterThan(50);
    expect(flightPose(flight, 0.25).r).toBeGreaterThan(10);
  });
});

// Settings → Board layout → Classic (#184): the theme's landscape layout,
// with your home on the bottom right (or mirrored, bottom left). Touches,
// targets, combined targets and flights all read the layout.
describe('classic board (#184)', () => {
  const theme = getTheme('walnut-kafeneio');
  const SIZE = { width: 375, height: 225 };
  const classicFor = (side: 'right' | 'left') =>
    fitBoardWithShadow(boardLayout(theme, 'classic', side), SIZE);
  const door = createBoard(
    { white: { points: { 13: 2, 6: 13 } }, black: { points: { 17: 1, 24: 14 } } },
    'contrary',
  );
  const flow = whiteToMove([5, 3], door);
  const sourcesOn = (g: BoardGeometry, view: BoardView) =>
    buildSources(g, currentBoard(flow), view, 'white', legalNextMoves(flow), flowPaths(flow));
  const cases = [
    ['right', 'White', WHITE],
    ['right', 'Black (flip)', BLACK],
    ['left', 'White', WHITE],
    ['left', 'Black (flip)', BLACK],
  ] as const;

  it('uses the landscape layout, and its mirror for the bottom left', () => {
    expect(boardLayout(theme, 'classic', 'right')).toBe(getLayout(theme, 'landscape'));
    expect(boardLayout(theme, 'classic', 'left')).toBe(boardLayout(theme, 'classic', 'left'));
    expect(boardLayout(theme, 'classic', 'left').artMirrored).toBe(true);
    expect(boardLayout(theme, 'tall', 'left')).toBe(portraitLayout(theme, 'left'));
  });

  it('puts your home at the bottom right, or the bottom left when mirrored', () => {
    for (const side of ['right', 'left'] as const) {
      const g = classicFor(side);
      const middle = g.x + g.width / 2;
      for (const index of [1, 2, 3, 4, 5, 6]) {
        const p = center(slotRect(g, { kind: 'point', index }));
        expect(p.y).toBeGreaterThan(g.y + g.height / 2);
        if (side === 'right') expect(p.x).toBeGreaterThan(middle);
        else expect(p.x).toBeLessThan(middle);
      }
    }
  });

  it.each(cases)(
    'gives the same moves as the tall board, on the drawn places (%s, %s view)',
    (side, _, view) => {
      const g = classicFor(side);
      const tall = sourcesOn(geo, view);
      const sources = sourcesOn(g, view);
      expect(sources.map((s) => s.key)).toEqual(tall.map((s) => s.key));
      const picture = layoutBoard(g, currentBoard(flow), view);
      sources.forEach((s, i) => {
        // Single and combined targets: the same moves as on the tall board.
        expect(s.targets.map((t) => t.moves)).toEqual(tall[i]!.targets.map((t) => t.moves));
        // The touched checker is the drawn one.
        const drawn = picture.checkers.find((c) => c.key === s.checker.key)!;
        expect([s.checker.x, s.checker.y]).toEqual([drawn.x, drawn.y]);
        // A tap on the checker selects it; a tap or a drop on each target plays it.
        expect(resolveTap(sources, null, s.checker.x, s.checker.y)).toEqual({
          kind: 'select',
          source: i,
        });
        s.targets.forEach((t, j) => {
          expect(resolveTap(sources, i, t.landing.x, t.landing.y)).toEqual({
            kind: 'move',
            source: i,
            target: j,
          });
          expect(resolveDrop(sources, i, t.landing.x, t.landing.y)).toEqual({
            kind: 'move',
            target: j,
          });
        });
      });
    },
  );

  it.each(cases)(
    'flies a combined move with a hit on the drawn places (%s, %s view)',
    (side, _, view) => {
      const g = classicFor(side);
      const steps: Move[] = [
        { from: 13, to: 8, die: 5, capture: 'hit' },
        { from: 8, to: 5, die: 3, capture: 'none' },
      ];
      const mid = applyMoveToBoard(door, 'white', steps[0]!, 'contrary');
      const end = applyMoveToBoard(mid, 'white', steps[1]!, 'contrary');
      const [mover, victim] = pathFlights(g, view, 'white', steps, door, {
        id: 'p',
        direction: 'contrary',
      });
      const [leg1] = moveFlights(g, view, 'white', steps[0]!, door, mid, { id: 'a' });
      const [leg2] = moveFlights(g, view, 'white', steps[1]!, mid, end, { id: 'b' });
      expect(mover).toMatchObject({ owner: 'white', from: leg1!.from, to: leg2!.to });
      // It lands where the board draws the checker.
      const drawn = layoutBoard(g, end, view).checkers.find((c) => c.key === mover!.hide)!;
      expect([mover!.to.x, mover!.to.y]).toEqual([drawn.x, drawn.y]);
      // The hit checker goes to the bar.
      expect(victim).toMatchObject({ owner: 'black', delay: HIT_DELAY_MS });
      expect(victim!.hide?.startsWith('bar:')).toBe(true);
    },
  );
});
