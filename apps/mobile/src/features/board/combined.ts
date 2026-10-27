/**
 * One checker, several dice in one step (#180): the "2+3" targets.
 *
 * Roll 2-3 and pick a checker: it may go 2, 3, or 2 and then 3 with the
 * same checker. For a double it may go 1, 2, 3 or 4 steps. This file finds
 * those paths. Pure TypeScript.
 *
 * Every step comes from the engine's legal moves (`legalNextMoves`) after
 * the steps before it. This file never checks a rule itself; it only
 * follows one checker through the engine's lists. So "use both dice if you
 * can", "play the larger die" and the Plakoto and Fevga rules hold by
 * themselves: a path the engine does not allow step by step is never found.
 */
import {
  applyGameAction,
  legalNextMoves,
  locationNumber,
  type Destination,
  type GameFlow,
  type Move,
  type Origin,
  type SourceMoves,
} from '@tavli/engine';

/** One checker moved with two or more dice, step by step. */
export interface MovePath {
  readonly from: Origin;
  readonly to: Destination;
  /** The single moves in the order they are played. Two or more. */
  readonly steps: readonly Move[];
}

/** The engine's legal single moves after `steps` are played on top of the turn so far. */
export type LegalAfter = (steps: readonly Move[]) => readonly SourceMoves[];

const keyOf = (from: Origin, to: Destination) => `${String(from)}>${String(to)}`;

/** How many steps before the last one hit or pin a checker. */
const capturesOnTheWay = (path: readonly Move[]) =>
  path.slice(0, -1).filter((m) => m.capture !== 'none').length;

/**
 * True when `a` is the better way to the same target than `b`.
 *
 * 1. Fewer steps (only bearing off can reach "off" with fewer dice).
 * 2. Fewer hits or pins on the way. A path that hits (Portes) or pins
 *    (Plakoto) on a middle point is offered only when no other order is
 *    legal. A player who wants the hit plays the two dice one by one.
 * 3. The lower die first ("a 2 and then a 3").
 */
function better(a: readonly Move[], b: readonly Move[]): boolean {
  if (a.length !== b.length) return a.length < b.length;
  const ca = capturesOnTheWay(a);
  const cb = capturesOnTheWay(b);
  if (ca !== cb) return ca < cb;
  for (let i = 0; i < a.length; i++) {
    const da = a[i]?.die ?? 0;
    const db = b[i]?.die ?? 0;
    if (da !== db) return da < db;
  }
  return false;
}

/**
 * Every target one checker can reach with two or more dice now, one path
 * per source and target.
 *
 * - `legal`: the engine's legal single moves now.
 * - `after`: the engine's legal single moves after some steps.
 *
 * A target that one die already reaches from the same source is left out
 * (the single move is the simpler way there). After a step to "off" the
 * checker is gone, so the path ends.
 *
 * Order: the checker furthest back first, then the shortest path.
 */
export function combinedPaths(legal: readonly SourceMoves[], after: LegalAfter): MovePath[] {
  const singles = new Set<string>();
  for (const group of legal)
    for (const move of group.moves) singles.add(keyOf(group.from, move.to));
  const best = new Map<string, MovePath>();

  const walk = (steps: readonly Move[]) => {
    const last = steps[steps.length - 1];
    if (last === undefined || last.to === 'off') return;
    // The same checker goes on from where it landed.
    const here = last.to;
    const next = after(steps).find((g) => g.from === here);
    if (next === undefined) return;
    for (const move of next.moves) {
      const path = [...steps, move];
      const first = path[0] as Move;
      const key = keyOf(first.from, move.to);
      if (!singles.has(key)) {
        const old = best.get(key);
        if (old === undefined || better(path, old.steps)) {
          best.set(key, { from: first.from, to: move.to, steps: path });
        }
      }
      walk(path);
    }
  };

  for (const group of legal) for (const move of group.moves) walk([move]);

  return [...best.values()].sort(
    (a, b) =>
      locationNumber(b.from) - locationNumber(a.from) ||
      a.steps.length - b.steps.length ||
      locationNumber(b.to) - locationNumber(a.to),
  );
}

/**
 * The combined paths of a game now, from the engine's own reducer: each
 * step is played with `applyGameAction`, and the next steps are
 * `legalNextMoves` of the flow that comes out. Empty unless the game waits
 * for a move.
 */
export function flowPaths(game: GameFlow): MovePath[] {
  const legal = legalNextMoves(game);
  if (legal.length === 0) return [];
  const player = game.state.toMove;
  // The flow after each list of steps, so a long path does not replay its start.
  const flows = new Map<string, GameFlow>();
  const flowAfter = (steps: readonly Move[]): GameFlow | null => {
    if (steps.length === 0) return game;
    const key = steps.map((m) => `${keyOf(m.from, m.to)}:${m.die}`).join(' ');
    const known = flows.get(key);
    if (known !== undefined) return known;
    const before = flowAfter(steps.slice(0, -1));
    const move = steps[steps.length - 1] as Move;
    if (before === null) return null;
    let next: GameFlow;
    try {
      next = applyGameAction(before, { type: 'move', player, move });
    } catch {
      return null;
    }
    flows.set(key, next);
    return next;
  };
  return combinedPaths(legal, (steps) => {
    const flow = flowAfter(steps);
    return flow === null ? [] : legalNextMoves(flow);
  });
}

/** A stable key for a path, e.g. `13>8:2+3`. */
export const pathKey = (path: MovePath) =>
  `${keyOf(path.from, path.to)}:${path.steps.map((m) => m.die).join('+')}`;

/** The points the checker stops on between its start and its target. */
export const pathStops = (path: MovePath): Destination[] =>
  path.steps.slice(0, -1).map((m) => m.to);
