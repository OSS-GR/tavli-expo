/**
 * A tiny fake variant, used only in tests. Not exported from the package.
 *
 * It proves that the `Variant` interface works end to end: start, roll,
 * list legal turns, apply, finish, score. The rules are made up and very
 * simple: each player starts with 15 checkers on own point 6. For each die,
 * the only legal move is to move the back checker (highest own point) by
 * that die, or bear it off. The two sides never meet.
 */

import { createBoard } from '../board';
import type { BoardState } from '../board';
import { CHECKERS_PER_PLAYER } from '../constants';
import { diceMoves } from '../dice';
import type { Dice } from '../dice';
import { EngineError } from '../errors';
import { sameTurn } from '../move';
import type { Move, Turn } from '../move';
import { absoluteToOwn, ownToAbsolute } from '../numbering';
import { PLAYERS, opponent } from '../player';
import type { PlayerId } from '../player';
import { GAME_STATE_SCHEMA_VERSION } from '../state';
import type { GameState } from '../state';
import type { GameResult, Variant } from '../variant';

const DIRECTION = 'contrary';

/** Own point → count for one player. */
function ownCounts(board: BoardState, player: PlayerId): number[] {
  const counts = Array.from({ length: 25 }, () => 0);
  board.points.forEach((point, index) => {
    counts[absoluteToOwn(index + 1, player, DIRECTION)] = point[player];
  });
  return counts;
}

function backPoint(counts: readonly number[]): number | null {
  for (let p = 24; p >= 1; p -= 1) if ((counts[p] ?? 0) > 0) return p;
  return null;
}

function applyMoves(board: BoardState, player: PlayerId, moves: readonly Move[]): BoardState {
  const points = board.points.map((p) => ({ ...p }));
  let off = board.off[player];
  for (const move of moves) {
    if (typeof move.from !== 'number') throw new EngineError('ILLEGAL_TURN', 'no bar in race');
    const from = points[ownToAbsolute(move.from, player, DIRECTION) - 1];
    if (from === undefined) throw new EngineError('ILLEGAL_TURN', 'bad origin');
    from[player] -= 1;
    if (move.to === 'off') {
      off += 1;
    } else {
      const to = points[ownToAbsolute(move.to, player, DIRECTION) - 1];
      if (to === undefined) throw new EngineError('ILLEGAL_TURN', 'bad destination');
      to[player] += 1;
    }
  }
  return { ...board, points, off: { ...board.off, [player]: off } };
}

function result(state: GameState): GameResult | null {
  for (const winner of PLAYERS) {
    if (state.board.off[winner] === CHECKERS_PER_PLAYER) {
      const loserOff = state.board.off[opponent(winner)];
      return { winner, points: loserOff === 0 ? 2 : 1, reason: 'borneOff' };
    }
  }
  return null;
}

function legalTurns(state: GameState, dice: Dice): readonly Turn[] {
  const player = state.toMove;
  const counts = ownCounts(state.board, player);
  const moves: Move[] = [];
  for (const die of diceMoves(dice)) {
    const from = backPoint(counts);
    if (from === null) break;
    const to = from - die <= 0 ? 'off' : from - die;
    counts[from] = (counts[from] ?? 0) - 1;
    if (to !== 'off') counts[to] = (counts[to] ?? 0) + 1;
    moves.push({ from, to, die, capture: 'none' });
  }
  return [{ player, dice, moves }];
}

export const raceVariant: Variant = {
  id: 'test-race',
  direction: DIRECTION,

  initialState({ startingPlayer, rules = { id: 'test-race', version: 1 } }) {
    return {
      schemaVersion: GAME_STATE_SCHEMA_VERSION,
      variant: 'test-race',
      rules,
      board: createBoard({ white: { points: { 6: 15 } }, black: { points: { 6: 15 } } }, DIRECTION),
      toMove: startingPlayer,
      dice: null,
      turnNumber: 1,
      variantData: null,
    };
  },

  legalTurns,

  applyTurn(state: GameState, turn: Turn): GameState {
    const legal = legalTurns(state, turn.dice);
    if (result(state) !== null || !legal.some((t) => sameTurn(t, turn))) {
      throw new EngineError('ILLEGAL_TURN', 'turn is not legal');
    }
    return {
      ...state,
      board: applyMoves(state.board, turn.player, turn.moves),
      toMove: opponent(state.toMove),
      dice: null,
      turnNumber: state.turnNumber + 1,
    };
  },

  isGameOver(state: GameState): boolean {
    return result(state) !== null;
  },

  result,
};
