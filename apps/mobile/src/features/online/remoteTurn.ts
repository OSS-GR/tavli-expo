/**
 * The other player's turn in an online game (#255). Pure.
 *
 * Their turn ends in one view: `game.lastTurn` holds its moves, and the
 * board already shows the end. The screen flies the moves from the board
 * of the view before. That works only when the view before is that turn
 * so far: their roll, the turn before it when the view of the roll was
 * missed (#355), or their draft (#374). So `remoteTurn` replays the moves
 * on it with the engine's `applyMoveToBoard` and checks that they end on
 * the new board. Moves the draft showed already do not fly again. Anything
 * else (a new game, a missed view, a turn of yours) gives `null`: the
 * board just shows the new position.
 *
 * Live moves (#374): while they move, each draft adds or takes back moves
 * on the same view. `remoteSteps` gives those too: the new moves fly from
 * the board before, and the moves taken back fly back, the last one first.
 */
import {
  applyMoveToBoard,
  currentBoard,
  type BoardState,
  type GameFlow,
  type GamePhase,
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

/** The same move: a view that crossed the network may add or drop fields. */
function sameMove(a: Move, b: Move): boolean {
  return a.from === b.from && a.to === b.to && a.die === b.die;
}

/** True when `start` is the first moves of `moves`. */
function startsWith(moves: readonly Move[], start: readonly Move[]): boolean {
  return start.length <= moves.length && start.every((move, i) => sameMove(move, moves[i] as Move));
}

function replay(board: BoardState, game: GameFlow, player: PlayerId, moves: readonly Move[]) {
  const direction = game.state.rules.movement.direction;
  let end = board;
  for (const move of moves) end = applyMoveToBoard(end, player, move, direction);
  return end;
}

/** Phases of a turn that has its roll. */
const IN_TURN: ReadonlySet<GamePhase> = new Set(['moving', 'awaiting-confirm']);

/** The turn of the other player that leads from `before` to `after`, or `null`. */
export function remoteTurn(before: MatchFlow, after: MatchFlow, me: PlayerId): RemoteTurn | null {
  const last = after.game.lastTurn;
  if (last === null || last.player === me || last.moves.length === 0) return null;
  const begun = IN_TURN.has(before.game.phase) || before.game.phase === 'awaiting-roll';
  if (!begun || before.game.state.toMove !== last.player) return null;
  const end = currentBoard(after.game);
  // Their draft showed the first moves already (#374): only the rest flies.
  const shown = before.game.played;
  if (shown.length > 0 && startsWith(last.moves, shown)) {
    const start = currentBoard(before.game);
    const moves = last.moves.slice(shown.length);
    if (sameBoard(replay(start, after.game, last.player, moves), end)) {
      return moves.length === 0 ? null : { player: last.player, moves, before: start };
    }
  }
  // The whole turn, from its start (with no draft, the board before).
  const start = before.game.state.board;
  if (!sameBoard(replay(start, after.game, last.player, last.moves), end)) return null;
  return { player: last.player, moves: last.moves, before: start };
}

/** What flies between two flows of the other player's turn. */
export interface RemoteSteps extends RemoteTurn {
  /**
   * True when they took the moves back (#374): the moves fly back, the
   * last one first, and `before` is the board after the undo.
   */
  readonly undo: boolean;
}

/**
 * The other player's draft (#374) between two flows of the same turn:
 * moves added on top, or moves taken back. `null` for anything else.
 */
function draftSteps(before: GameFlow, after: GameFlow, me: PlayerId): RemoteSteps | null {
  const player = after.state.toMove;
  if (player === me || before.state.toMove !== player) return null;
  if (!IN_TURN.has(before.phase) || !IN_TURN.has(after.phase)) return null;
  if (before.state.turnNumber !== after.state.turnNumber) return null;
  if (!sameBoard(before.state.board, after.state.board)) return null;
  const was = before.played;
  const now = after.played;
  if (now.length > was.length && startsWith(now, was)) {
    return { player, moves: now.slice(was.length), before: currentBoard(before), undo: false };
  }
  if (now.length < was.length && startsWith(was, now)) {
    return { player, moves: was.slice(now.length), before: currentBoard(after), undo: true };
  }
  return null;
}

/**
 * What of the other player's turn flies from `before` to `after`: the end
 * of their turn (`remoteTurn`), or a step of their draft (#374). `null`
 * when nothing flies.
 */
export function remoteSteps(before: MatchFlow, after: MatchFlow, me: PlayerId): RemoteSteps | null {
  const turn = remoteTurn(before, after, me);
  if (turn !== null) return { ...turn, undo: false };
  if (before.match.games.length !== after.match.games.length) return null;
  return draftSteps(before.game, after.game, me);
}
