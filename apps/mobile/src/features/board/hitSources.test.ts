/**
 * #179: the checker that just moved (after a hit in Portes, a pin in
 * Plakoto, or a plain move in Fevga) stays touchable for the next die.
 *
 * Seeded random games. After each capture (and after each move in Fevga),
 * when the engine lists a move from the checker's new point, the board
 * must offer that checker: drawn where the touch finds it, selected by a
 * tap, and every target reached by a tap and by a drop. In both views
 * (flip), on the tall and the classic board, with home on either side.
 * The checks only place the engine's moves; they make no rule of their own.
 */
import {
  applyGameAction,
  createGameFlow,
  createSeededRng,
  currentBoard,
  fevga,
  legalNextMoves,
  plakoto,
  portes,
  resolveRules,
  type DieValue,
  type GameFlow,
  type Move,
} from '@tavli/engine';
import { getTheme } from '@tavli/themes';

import { boardLayout } from './BoardCanvas';
import { layoutBoard, slotOfDestination, type BoardView } from './boardModel';
import { flowPaths } from './combined';
import { moveFlights } from './flights';
import { fitBoardWithShadow, slotKey } from './geometry';
import { buildSources, resolveDrop, resolveTap } from './interaction';

const theme = getTheme('walnut-kafeneio');
const VARIANTS = { portes, plakoto, fevga } as const;
type Game = keyof typeof VARIANTS;

const BOARDS = (['tall', 'classic'] as const).flatMap((mode) =>
  (['left', 'right'] as const).map((side) => {
    const size = mode === 'tall' ? { width: 375, height: 560 } : { width: 700, height: 380 };
    return {
      name: `${mode}/${side}`,
      geo: fitBoardWithShadow(boardLayout(theme, mode, side), size),
    };
  }),
);

/** What is wrong with the moved checker's next move on the board, or `[]`. */
function problemsAfter(flow: GameFlow, move: Move): string[] {
  const mover = flow.state.toMove;
  const next = applyGameAction(flow, { type: 'move', player: mover, move });
  if (next.phase !== 'moving' || move.to === 'off') return [];
  const legal = legalNextMoves(next);
  const group = legal.find((g) => g.from === move.to);
  if (group === undefined) return [];
  const before = currentBoard(flow);
  const after = currentBoard(next);
  const paths = flowPaths(next);
  const out: string[] = [];
  for (const viewer of ['white', 'black'] as const) {
    const view: BoardView = { viewer, direction: flow.state.rules.movement.direction };
    for (const { name, geo } of BOARDS) {
      const where = `${viewer} view, ${name}, after ${move.from}/${move.to} (${move.capture})`;
      const sources = buildSources(geo, after, view, mover, legal, paths);
      const key = slotKey(slotOfDestination(move.to, mover, view));
      const i = sources.findIndex((s) => s.key === key);
      const s = sources[i];
      if (s === undefined) {
        out.push(`${where}: no source on ${key}`);
        continue;
      }
      const drawn = layoutBoard(geo, after, view).checkers.find((c) => c.key === s.checker.key);
      if (drawn?.owner !== mover || drawn.x !== s.checker.x || drawn.y !== s.checker.y) {
        out.push(`${where}: ${s.checker.key} is not drawn where the touch finds it`);
      }
      // Its own flight lands on it, where it is drawn.
      const [flight] = moveFlights(geo, view, mover, move, before, after, { id: 'f' });
      if (flight?.to.x !== s.checker.x || flight.to.y !== s.checker.y) {
        out.push(`${where}: the flight lands away from the checker`);
      }
      const tap = resolveTap(sources, null, s.checker.x, s.checker.y);
      if (tap.kind !== 'select' || tap.source !== i) out.push(`${where}: a tap does not select it`);
      for (const m of group.moves) {
        // Two dice to the same target show once (the lower die).
        if (!s.targets.some((t) => t.move.to === m.to)) {
          out.push(`${where}: no target ${m.from}/${m.to}`);
        }
      }
      s.targets.forEach((t, j) => {
        const byTap = resolveTap(sources, i, t.landing.x, t.landing.y);
        if (byTap.kind !== 'move' || byTap.target !== j) {
          out.push(`${where}: a tap on ${t.key} does not move it`);
        }
        const byDrop = resolveDrop(sources, i, t.landing.x, t.landing.y);
        if (byDrop.kind !== 'move' || byDrop.target !== j) {
          out.push(`${where}: a drop on ${t.key} does not move it`);
        }
      });
    }
  }
  return out;
}

/** Plays `games` seeded random games; checks every capture (Fevga: every move). */
function check(game: Game, games: number): { checked: number; problems: string[] } {
  const rules = resolveRules(game, { match: { rotation: [game] } });
  const rng = createSeededRng(179);
  const die = () => (1 + (rng.nextUint32() % 6)) as DieValue;
  const problems: string[] = [];
  let checked = 0;
  for (let g = 0; g < games; g++) {
    const state = VARIANTS[game].initialState({
      startingPlayer: g % 2 === 0 ? 'white' : 'black',
      rules,
    });
    let flow: GameFlow = createGameFlow({ state, starter: state.toMove });
    for (let turn = 0; turn < 120 && flow.phase === 'awaiting-roll'; turn++) {
      const mover = flow.state.toMove;
      flow = applyGameAction(flow, { type: 'roll', player: mover, dice: [die(), die()] });
      while (flow.phase === 'moving') {
        const moves = legalNextMoves(flow).flatMap((s) => s.moves);
        if (moves.length === 0) break;
        for (const move of moves) {
          if (game !== 'fevga' && move.capture === 'none') continue;
          checked += 1;
          problems.push(...problemsAfter(flow, move).map((p) => `${game} game ${g}: ${p}`));
        }
        const pick = moves[rng.nextUint32() % moves.length] as Move;
        flow = applyGameAction(flow, { type: 'move', player: mover, move: pick });
      }
      if (flow.phase === 'awaiting-confirm') {
        flow = applyGameAction(flow, { type: 'confirm', player: mover });
      }
    }
  }
  return { checked, problems };
}

describe('the moved checker plays on, on every board (#179)', () => {
  it.each([
    ['portes', 'a hit', 6],
    ['plakoto', 'a pin', 6],
    ['fevga', 'a move', 1],
  ] as const)('%s: after %s', (game, _, games) => {
    const { checked, problems } = check(game, games);
    expect(checked).toBeGreaterThan(20);
    expect(problems.slice(0, 10)).toEqual([]);
  });
});
