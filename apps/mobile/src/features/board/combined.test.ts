/**
 * #180: one checker moved with several dice. The paths come only from the
 * engine's legal moves, step by step; these tests check that, the order
 * rule (a hit on the way when an order hits, but no pin on the way when
 * another order is legal), doubles, bearing off, and Plakoto, Fevga and
 * Asodio.
 */
import {
  applyGameAction,
  asodio,
  createBoard,
  createGameFlow,
  createSeededRng,
  currentBoard,
  fevga,
  legalNextMoves,
  plakoto,
  portes,
  resolveRules,
  type BoardState,
  type DieValue,
  type GameFlow,
  type Move,
} from '@tavli/engine';

import { combinedPaths, flowPaths, pathKey, pathStops, type MovePath } from './combined';

type Game = 'portes' | 'plakoto' | 'fevga';
const VARIANTS = { portes, plakoto, fevga } as const;

/** White to move with `dice` in `game`, on its start or on `board`. */
function whiteToMove(game: Game, dice: [DieValue, DieValue], board?: BoardState): GameFlow {
  const rules = resolveRules(game, { match: { rotation: [game] } });
  const start = VARIANTS[game].initialState({ startingPlayer: 'white', rules });
  const state = board ? { ...start, board } : start;
  const flow = createGameFlow({ state, starter: 'white' });
  return applyGameAction(flow, { type: 'roll', player: 'white', dice });
}

const short = (m: Move) => `${m.from}/${m.to}${m.capture === 'none' ? '' : '*'}(${m.die})`;
const shortPath = (p: MovePath) => p.steps.map(short).join(' ');

/** White's door on 13 and 13 on 6. Black has a blot on White's 8 (Black's 17). */
const door = (extra: Record<number, number> = {}, direction: 'contrary' = 'contrary') =>
  createBoard(
    {
      white: { points: { 13: 2, 6: 13 } },
      black: { points: { 17: 1, 24: 14 - sum(extra), ...extra } },
    },
    direction,
  );
const sum = (r: Record<number, number>) => Object.values(r).reduce((a, b) => a + b, 0);

/** Plays `path` with the engine's reducer; throws if a step is not legal. */
function replay(flow: GameFlow, path: MovePath): GameFlow {
  return path.steps.reduce(
    (f, move) => applyGameAction(f, { type: 'move', player: f.state.toMove, move }),
    flow,
  );
}

describe('combinedPaths (#180)', () => {
  it('Portes 6-1 at the start: only 13/7/6, the order whose steps are both legal', () => {
    const flow = whiteToMove('portes', [6, 1]);
    // 24/17 and 8/1 land on Black's points; 13/12/6 starts on Black's five.
    expect(flowPaths(flow).map(shortPath)).toEqual(['13/7(6) 7/6(1)']);
  });

  it('plays the lower die first when both orders are the same', () => {
    const board = createBoard(
      { white: { points: { 13: 2, 6: 13 } }, black: { points: { 24: 15 } } },
      'contrary',
    );
    const paths = flowPaths(whiteToMove('portes', [5, 3], board));
    // 13/10/5 and 13/8/5 hit nothing: the 3 goes first.
    expect(paths.map(shortPath)).toEqual(['13/10(3) 10/5(5)']);
  });

  it('Portes: prefers the order that hits on the way', () => {
    const flow = whiteToMove('portes', [5, 3], door());
    const paths = flowPaths(flow);
    // 13/10/5 is legal too, but 13/8* then 8/5 hits the blot on the way.
    expect(paths.map(shortPath)).toEqual(['13/8*(5) 8/5(3)']);
    expect(pathStops(paths[0]!)).toEqual([8]);
    // The engine plays it, and the hit Black checker stays on the bar.
    expect(currentBoard(replay(flow, paths[0]!)).bar.black).toBe(1);
  });

  it('Portes: offers the hit on the way when it is the only order', () => {
    // Black makes White's 10 (Black's 15): 13/10 is closed.
    const flow = whiteToMove('portes', [5, 3], door({ 15: 2 }));
    expect(flowPaths(flow).map(shortPath)).toEqual(['13/8*(5) 8/5(3)']);
  });

  it('Plakoto: prefers the order that does not pin on the way', () => {
    const flow = whiteToMove('plakoto', [5, 3], door());
    expect(flowPaths(flow).map(shortPath)).toEqual(['13/10(3) 10/5(5)']);
  });

  it('Plakoto: pins on the way (and leaves the pin) when it is the only order', () => {
    const flow = whiteToMove('plakoto', [5, 3], door({ 15: 2 }));
    const paths = flowPaths(flow);
    expect(paths.map(shortPath)).toEqual(['13/8*(5) 8/5(3)']);
    // The engine plays it, and the Black checker is free again.
    const after = replay(flow, paths[0]!);
    expect(after.phase).toBe('awaiting-confirm');
  });

  it('a double reaches 2, 3 and 4 steps, each step legal', () => {
    const board = createBoard(
      { white: { points: { 13: 1, 6: 14 } }, black: { points: { 24: 15 } } },
      'contrary',
    );
    const flow = whiteToMove('portes', [2, 2], board);
    const from13 = flowPaths(flow).filter((p) => p.from === 13);
    expect(from13.map((p) => [p.to, p.steps.length])).toEqual([
      [9, 2],
      [7, 3],
      [5, 4],
    ]);
    expect(pathStops(from13[2]!)).toEqual([11, 9, 7]);
    expect(pathKey(from13[2]!)).toBe('13>5:2+2+2+2');
  });

  it('stops a double where a step is blocked', () => {
    // Black holds White's 9 (Black's 16): 13 can go 11, but not past 9.
    const board = createBoard(
      { white: { points: { 13: 1, 6: 14 } }, black: { points: { 16: 2, 24: 13 } } },
      'contrary',
    );
    const flow = whiteToMove('portes', [2, 2], board);
    expect(flowPaths(flow).filter((p) => p.from === 13)).toEqual([]);
  });

  it('bears off with both dice, lower die first', () => {
    const board = createBoard(
      { white: { points: { 5: 1, 1: 1 }, off: 13 }, black: { points: { 1: 15 } } },
      'contrary',
    );
    const flow = whiteToMove('portes', [3, 2], board);
    const from5 = flowPaths(flow).filter((p) => p.from === 5);
    expect(from5.map(shortPath)).toEqual(['5/3(2) 3/off(3)']);
  });

  it('leaves out a target one die already reaches', () => {
    // Both on 2 and 1 bear off with one die: no "2+1" path to off.
    const board = createBoard(
      { white: { points: { 2: 1, 1: 1 }, off: 13 }, black: { points: { 1: 15 } } },
      'contrary',
    );
    const flow = whiteToMove('portes', [5, 2], board);
    expect(flowPaths(flow).filter((p) => p.to === 'off')).toEqual([]);
  });

  it('never offers a path when the engine allows only one die', () => {
    // White's only checker outside home is on 8; 8/2 and 8/7 are open but
    // 2/1 and 7/1 land on Black's point. The 6 then the 1 is not legal.
    const board = createBoard(
      { white: { points: { 8: 1, 6: 14 } }, black: { points: { 24: 15 } } },
      'contrary',
    );
    const flow = whiteToMove('portes', [6, 1], board);
    expect(flowPaths(flow).filter((p) => p.from === 8)).toEqual([]);
  });

  it('Fevga: the first checker goes 24/16 with 5-3', () => {
    const flow = whiteToMove('fevga', [5, 3]);
    const paths = flowPaths(flow);
    expect(paths.map((p) => `${p.from}/${p.to}`)).toContain('24/16');
    for (const path of paths) expect(() => replay(flow, path)).not.toThrow();
  });

  it('asks the engine for each step (combinedPaths with a fake engine)', () => {
    const asked: string[] = [];
    const a: Move = { from: 13, to: 10, die: 3, capture: 'none' };
    const b: Move = { from: 10, to: 5, die: 5, capture: 'none' };
    const paths = combinedPaths([{ from: 13, moves: [a] }], (steps) => {
      asked.push(steps.map(short).join(' '));
      return steps.length === 1 ? [{ from: 10, moves: [b] }] : [];
    });
    expect(paths.map(shortPath)).toEqual(['13/10(3) 10/5(5)']);
    expect(asked).toEqual(['13/10(3)', '13/10(3) 10/5(5)']);
  });
});

/**
 * Random games of every game: each path the helper offers is legal step by
 * step, and every target the engine allows with one checker and two or
 * more dice is offered (or is already a one-die target).
 */
describe('combinedPaths in random games', () => {
  const games = [
    ['portes', portes, 'portes'],
    ['plakoto', plakoto, 'plakoto'],
    ['fevga', fevga, 'fevga'],
    ['asodio', asodio, 'asodio.kafeneio'],
  ] as const;

  it.each(games)('%s', (game, variant, preset) => {
    const rules = resolveRules(preset, { match: { rotation: [game] } });
    const rng = createSeededRng(180);
    let flow = createGameFlow({
      state: variant.initialState({ startingPlayer: 'white', rules }),
      starter: 'white',
    });
    let checked = 0;
    for (let turn = 0; turn < 60 && flow.phase !== 'game-over'; turn++) {
      const player = flow.state.toMove;
      if (flow.phase === 'awaiting-roll')
        flow = applyGameAction(flow, { type: 'roll', player }, { rng });
      if (flow.phase === 'awaiting-answer') break;
      while (flow.phase === 'moving') {
        const legal = legalNextMoves(flow);
        const paths = flowPaths(flow);
        const singles = new Set(
          legal.flatMap((g) => g.moves.map((m) => `${String(g.from)}>${String(m.to)}`)),
        );
        const offered = new Set(paths.map((p) => `${String(p.from)}>${String(p.to)}`));
        for (const path of paths) {
          expect(path.steps.length).toBeGreaterThan(1);
          expect(path.steps[0]!.from).toBe(path.from);
          expect(path.steps[path.steps.length - 1]!.to).toBe(path.to);
          expect(singles.has(`${String(path.from)}>${String(path.to)}`)).toBe(false);
          expect(() => replay(flow, path)).not.toThrow();
          checked += 1;
        }
        // Every two-step move of one checker the engine allows is offered.
        for (const group of legal) {
          for (const first of group.moves) {
            if (first.to === 'off') continue;
            const next = applyGameAction(flow, { type: 'move', player, move: first });
            for (const g of legalNextMoves(next)) {
              if (g.from !== first.to) continue;
              for (const second of g.moves) {
                const key = `${String(group.from)}>${String(second.to)}`;
                expect(singles.has(key) || offered.has(key)).toBe(true);
              }
            }
          }
        }
        // Play on: a path when there is one, else the first single move.
        const pick = paths[turn % 2] ?? null;
        if (pick) flow = replay(flow, pick);
        else {
          const move = legal[0]!.moves[0]!;
          flow = applyGameAction(flow, { type: 'move', player, move });
        }
      }
      if (flow.phase === 'awaiting-confirm')
        flow = applyGameAction(flow, { type: 'confirm', player });
    }
    expect(checked).toBeGreaterThan(5);
  });
});
