/**
 * Asodio on the board (#124): the "to enter" stacks, entering by tap, the
 * loading lock and the checkers the quarter lock freezes (A6).
 */
import {
  applyGameAction,
  applyMoveToBoard,
  asodio,
  createBoard,
  createGameFlow,
  currentBoard,
  getPreset,
  legalNextMoves,
  type BoardState,
  type DieValue,
  type GameFlow,
} from '@tavli/engine';
import { getLayout, getTheme } from '@tavli/themes';

import {
  armyFrozen,
  asodioMarks,
  frozenPoints,
  loadingGate,
  opensGate,
  quarterOf,
  rearQuarter,
  toEnterCount,
} from './asodio';
import { boardStacks, countIn, layoutBoard, slotOfOrigin, type BoardView } from './boardModel';
import { moveFlights } from './flights';
import { fitBoard, slotRect, stackGeometry, type ScreenRect } from './geometry';
import { buildSources, resolveTap, type MovableSource } from './interaction';
import { SAMPLE_POSITIONS } from './positions';

const rules = getPreset('asodio.kafeneio');
const layout = getLayout(getTheme('walnut-kafeneio'), 'portrait-rotated');
const geo = fitBoard(layout, { width: 377, height: 630 });
const WHITE: BoardView = { viewer: 'white', direction: 'contrary' };
const BLACK: BoardView = { viewer: 'black', direction: 'contrary' };

const center = (r: ScreenRect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** White to move with these dice in Asodio, on the start or on `board`. */
function whiteRolls(dice: [DieValue, DieValue], board?: BoardState): GameFlow {
  const start = asodio.initialState({ startingPlayer: 'white', rules });
  const state = board ? { ...start, board } : start;
  return applyGameAction(createGameFlow({ state, starter: 'white' }), {
    type: 'roll',
    player: 'white',
    dice,
  });
}

function sourcesFor(flow: GameFlow, view = WHITE): MovableSource[] {
  return buildSources(geo, currentBoard(flow), view, 'white', legalNextMoves(flow));
}

describe('the rules helpers', () => {
  it('numbers the quarters from the start', () => {
    expect([24, 19, 18, 13, 12, 7, 6, 1].map(quarterOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it('counts the checkers to enter', () => {
    expect(toEnterCount(SAMPLE_POSITIONS.asodioStart, 'white')).toBe(15);
    expect(toEnterCount(SAMPLE_POSITIONS.asodioLoading, 'white')).toBe(8);
    expect(toEnterCount(SAMPLE_POSITIONS.start, 'white')).toBe(0);
  });

  it('asodio.md #14, #15: the loading lock opens with a 1-2 or a double', () => {
    expect(loadingGate(SAMPLE_POSITIONS.asodioStart, 'white', rules)).toBe('aceDeuceOrDouble');
    // One checker in: the lock is gone.
    expect(loadingGate(SAMPLE_POSITIONS.asodioLoading, 'white', rules)).toBeNull();
    // Black has not entered any checker yet: still locked.
    expect(loadingGate(SAMPLE_POSITIONS.asodioLoading, 'black', rules)).toBe('aceDeuceOrDouble');
    expect(opensGate('aceDeuceOrDouble', [5, 3])).toBe(false);
    expect(opensGate('aceDeuceOrDouble', [2, 1])).toBe(true);
    expect(opensGate('aceDeuceOrDouble', [6, 6])).toBe(true);
    expect(opensGate('doubleOnly', [1, 2])).toBe(false);
    expect(opensGate('doubleOnly', [4, 4])).toBe(true);
    const doubleOnly = {
      ...rules,
      entry: { ...rules.entry, firstEntryGateRolls: 'doubleOnly' as const },
    };
    expect(loadingGate(SAMPLE_POSITIONS.asodioStart, 'black', doubleOnly)).toBe('doubleOnly');
    // Other games have no lock.
    expect(loadingGate(SAMPLE_POSITIONS.start, 'white', getPreset('portes'))).toBeNull();
  });

  it('asodio.md #17: checkers in front of the rear quarter are frozen', () => {
    // White: one checker still on own 21 (quarter 0), the rest in quarter 1.
    const board = createBoard(
      {
        white: { points: { 21: 1, 18: 6, 17: 4, 15: 4 } },
        black: { points: { 24: 15 } },
      },
      'contrary',
    );
    expect(rearQuarter(board, 'white', rules)).toBe(0);
    expect(frozenPoints(board, 'white', rules)).toEqual([18, 17, 15]);
    expect(frozenPoints(board, 'black', rules)).toEqual([]);
    expect(armyFrozen(board, 'white', rules)).toBe(false);
    // Without the quarter lock nothing is frozen.
    const free = { ...rules, quarters: { ...rules.quarters, quarterLock: false } };
    expect(frozenPoints(board, 'white', free)).toEqual([]);
    expect(asodioMarks(board, free, WHITE)).toEqual({});
  });

  it('marks nothing while loading: every checker is in the starting quarter', () => {
    expect(frozenPoints(SAMPLE_POSITIONS.asodioLoading, 'white', rules)).toEqual([]);
    expect(asodioMarks(SAMPLE_POSITIONS.asodioLoading, rules, WHITE)).toEqual({});
  });

  it('asodio.md #19 and A6: a pinned lagging checker freezes the whole army', () => {
    const board = SAMPLE_POSITIONS.asodioFrozen;
    expect(armyFrozen(board, 'white', rules)).toBe(true);
    expect(frozenPoints(board, 'white', rules)).toEqual([18, 16, 14]);
    // Black's pinner on own 5 is in front of Black's rear quarter (7–12).
    expect(armyFrozen(board, 'black', rules)).toBe(false);
    expect(frozenPoints(board, 'black', rules)).toEqual([5]);
    // The engine agrees: White has no move with any roll.
    const state = { ...asodio.initialState({ startingPlayer: 'white', rules }), board };
    for (const dice of [
      [6, 5],
      [1, 1],
      [3, 2],
    ] as const) {
      expect(asodio.legalTurns(state, dice)).toEqual([{ player: 'white', dice, moves: [] }]);
    }
  });

  it('turns the frozen marks into layout slots for both players', () => {
    const marks = asodioMarks(SAMPLE_POSITIONS.asodioFrozen, rules, WHITE);
    // White 18, 16, 14 and Black 5 (= White 20, where it pins).
    expect([...(marks.frozen ?? [])].sort()).toEqual(['p14', 'p16', 'p18', 'p20']);
    const flipped = asodioMarks(SAMPLE_POSITIONS.asodioFrozen, rules, BLACK);
    expect([...(flipped.frozen ?? [])].sort()).toEqual(['p11', 'p5', 'p7', 'p9']);
  });
});

describe('the "to enter" stacks', () => {
  it('asodio.md #1: puts each player’s 15 on their own bar half, next to the starting quarter', () => {
    const stacks = boardStacks(SAMPLE_POSITIONS.asodioStart, WHITE);
    expect(stacks.map((s) => [s.slot, s.owners.length, s.toEnter])).toEqual([
      [{ kind: 'bar', side: 'player' }, 15, true],
      [{ kind: 'bar', side: 'opponent' }, 15, true],
    ]);
    // White's half sits over its spot 6 (own 19), Black's over Black's spot 6.
    const bar = slotRect(geo, { kind: 'bar', side: 'player' });
    const spot6 = slotRect(geo, slotOfOrigin(19, 'white', WHITE));
    expect(bar.x).toBeCloseTo(spot6.x, 0);
    const barB = slotRect(geo, { kind: 'bar', side: 'opponent' });
    const spot6B = slotRect(geo, slotOfOrigin(19, 'black', WHITE));
    expect(barB.x).toBeCloseTo(spot6B.x, 0);
  });

  it('always shows the count, even for a short stack', () => {
    const start = layoutBoard(geo, SAMPLE_POSITIONS.asodioStart, WHITE);
    expect(start.badges.map((b) => [b.key, b.count])).toEqual([
      ['bar:player', 15],
      ['bar:opponent', 15],
    ]);
    const board = createBoard(
      { white: { points: { 24: 12 }, outside: 3 }, black: { outside: 15 } },
      'contrary',
    );
    const picture = layoutBoard(geo, board, WHITE);
    expect(picture.badges).toContainEqual(expect.objectContaining({ key: 'bar:player', count: 3 }));
    expect(picture.checkers.filter((c) => c.key.startsWith('bar:player'))).toHaveLength(3);
    expect(countIn(board, { kind: 'bar', side: 'player' }, WHITE)).toBe(3);
  });

  it('a hit checker on the bar (Portes) keeps the usual badge rule', () => {
    const picture = layoutBoard(geo, SAMPLE_POSITIONS.midgame, WHITE);
    expect(picture.badges.map((b) => b.key)).toEqual(['p6']);
  });

  it('draws frozen checkers with a mark, and only those', () => {
    const board = SAMPLE_POSITIONS.asodioFrozen;
    const picture = layoutBoard(geo, board, WHITE, asodioMarks(board, rules, WHITE));
    const frozen = picture.checkers.filter((c) => c.frozen).map((c) => c.key.split(':')[0]);
    expect([...new Set(frozen)].sort()).toEqual(['p14', 'p16', 'p18', 'p20']);
    // The pinned White checker is a pin, not a frozen checker.
    expect(picture.pins.map((p) => [p.key, p.owner])).toEqual([['p20:pinned', 'white']]);
    expect(picture.checkers.filter((c) => !c.frozen).length).toBeGreaterThan(0);
  });
});

describe('entering by tap', () => {
  it('asodio.md #15: a 1-2 enters on spots 1 and 2 (own 24 and 23)', () => {
    const flow = whiteRolls([1, 2]);
    const sources = sourcesFor(flow);
    expect(sources.map((s) => s.key)).toEqual(['bar:player']);
    const stack = sources[0]!;
    // The stack's top checker is the drawn one; it may go to spot 1 or 2.
    expect(stack.checker.key).toBe('bar:player:4');
    expect(stack.targets.map((t) => t.key).sort()).toEqual(['p23', 'p24']);
    expect(stack.targets.every((t) => t.move.from === 'outside')).toBe(true);

    // Tap the stack, then spot 1.
    const select = resolveTap(sources, null, center(stack.rect).x, center(stack.rect).y);
    expect(select).toEqual({ kind: 'select', source: 0 });
    const spot1 = stack.targets.findIndex((t) => t.key === 'p24');
    const at = center(stack.targets[spot1]!.rect);
    expect(resolveTap(sources, 0, at.x, at.y)).toEqual({ kind: 'move', source: 0, target: spot1 });
  });

  it('asodio.md #14: a 5-3 on the locked board leaves nothing to touch', () => {
    const flow = whiteRolls([5, 3]);
    // The engine passes the turn at once: no source, no target.
    expect(flow.phase).toBe('awaiting-roll');
    expect(flow.state.toMove).toBe('black');
    expect(flow.lastTurn?.moves).toEqual([]);
  });

  it('A1: a double enters four on one spot, one tap pair each', () => {
    let flow = whiteRolls([3, 3]);
    for (let n = 0; n < 4; n++) {
      const sources = sourcesFor(flow);
      expect(sources.map((s) => s.key)).toEqual(['bar:player']);
      const [target] = sources[0]!.targets;
      expect(target?.key).toBe('p22');
      flow = applyGameAction(flow, { type: 'move', player: 'white', move: target!.move });
    }
    const board = currentBoard(flow);
    expect(board.points[21]).toMatchObject({ white: 4 });
    expect(board.outside.white).toBe(11);
  });

  it('asodio.md #16 and A2: while loading, only the stack moves', () => {
    const flow = whiteRolls([6, 4], SAMPLE_POSITIONS.asodioLoading);
    const sources = sourcesFor(flow);
    expect(sources.map((s) => s.key)).toEqual(['bar:player']);
    expect(sources[0]!.targets.map((t) => t.key).sort()).toEqual(['p19', 'p21']);
  });

  it('flies an entering checker from the stack to its spot, and back on undo', () => {
    const flow = whiteRolls([1, 2]);
    const before = currentBoard(flow);
    const move = {
      from: 'outside' as const,
      to: 24 as const,
      die: 1 as const,
      capture: 'none' as const,
    };
    const after = applyMoveToBoard(before, 'white', move, 'contrary');
    const [flight] = moveFlights(geo, WHITE, 'white', move, before, after, { id: 'm' });
    const barTop = stackGeometry(geo, { kind: 'bar', side: 'player' }, 15);
    expect(flight!.from).toMatchObject(barTop.centers[barTop.centers.length - 1]!);
    // Bar checkers are smaller: the checker grows on its way in.
    expect(flight!.fromR).toBeLessThan(flight!.toR);
    const spot = stackGeometry(geo, { kind: 'point', index: 24 }, 1).centers[0]!;
    expect(flight!.to).toMatchObject(spot);
    const [back] = moveFlights(geo, WHITE, 'white', move, after, before, { id: 'u', undo: true });
    expect(back!.from).toMatchObject(spot);
  });
});
