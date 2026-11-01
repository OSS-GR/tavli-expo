/**
 * The other player's turn in an online game (#255). Pure.
 *
 * Their whole turn arrives in one view: `game.lastTurn` holds its moves,
 * and the board already shows the end. The screen flies the moves from
 * the board of the view before. That works only when the view before is
 * the start of that turn, so `remoteTurn` replays the moves on it with
 * the engine's `applyMoveToBoard` and checks that they end on the new
 * board. Anything else (a new game, a missed view, a turn of yours) gives
 * `null`: the board just shows the new position.
 */
import {
  applyMoveToBoard,
  currentBoard,
  type BoardState,
  type MatchFlow,
  type Move,
  type PlayerId,
} from '@tavli/engine';

export interface RemoteTurn {
  readonly player: PlayerId;
  readonly moves: readonly Move[];
  /** The board before the first move. */
  readonly before: BoardState;
}

const SIDES = ['white', 'black'] as const;

/** Field by field: a view that crossed the network may list its keys in another order. */
function sameBoard(a: BoardState, b: BoardState): boolean {
  if (a.points.length !== b.points.length) return false;
  const pointsMatch = a.points.every((p, i) => {
    const q = b.points[i];
    return q !== undefined && p.white === q.white && p.black === q.black && p.pinned === q.pinned;
  });
  return (
    pointsMatch &&
    SIDES.every(
      (side) =>
        a.bar[side] === b.bar[side] &&
        a.off[side] === b.off[side] &&
        a.outside[side] === b.outside[side],
    )
  );
}

/** The turn of the other player that leads from `before` to `after`, or `null`. */
export function remoteTurn(before: MatchFlow, after: MatchFlow, me: PlayerId): RemoteTurn | null {
  const last = after.game.lastTurn;
  if (last === null || last.player === me || last.moves.length === 0) return null;
  if (before.game.phase !== 'moving' || before.game.state.toMove !== last.player) return null;
  const start = currentBoard(before.game);
  const direction = after.game.state.rules.movement.direction;
  let board = start;
  for (const move of last.moves) board = applyMoveToBoard(board, last.player, move, direction);
  if (!sameBoard(board, currentBoard(after.game))) return null;
  return { player: last.player, moves: last.moves, before: start };
}
