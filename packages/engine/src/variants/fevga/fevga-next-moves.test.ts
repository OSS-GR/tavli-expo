/** Fevga `nextMoves`: one move at a time, for the turn flow. */

import { describe, expect, it } from 'vitest';

import { applyMoveToBoard } from '../../board';
import type { BoardState } from '../../board';
import type { Dice } from '../../dice';
import { formatMove } from '../../move';
import type { Move } from '../../move';
import { resolveRules } from '../../presets';
import type { GameState } from '../../state';
import { fevgaState, formatFevgaPosition } from '../../testing/fevga-notation';
import { randomFevgaPositions } from '../../testing/random-fevga-positions';
import { fevga } from './index';

function boardAfter(state: GameState, moves: readonly Move[]): BoardState {
  return moves.reduce((b, m) => applyMoveToBoard(b, state.toMove, m, 'parallel'), state.board);
}

/**
 * Every full sequence `nextMoves` allows, walked one move at a time.
 * Sub-states with the same board and the same dice played are walked once.
 */
function walk(state: GameState, dice: Dice): { finals: Set<string>; sequences: Move[][] } {
  const finals = new Set<string>();
  const sequences: Move[][] = [];
  const seen = new Set<string>();
  const go = (played: Move[]): void => {
    const options = fevga.nextMoves(state, dice, played);
    if (options.length === 0) {
      sequences.push(played);
      finals.add(formatFevgaPosition(boardAfter(state, played)));
      return;
    }
    for (const move of options) {
      const after = [...played, move];
      const dice = after
        .map((m) => m.die)
        .sort()
        .join('');
      const key = `${formatFevgaPosition(boardAfter(state, after))}|${dice}`;
      if (seen.has(key)) continue;
      seen.add(key);
      go(after);
    }
  };
  go([]);
  return { finals, sequences };
}

describe('Fevga nextMoves (one move at a time)', () => {
  it('a move that would leave a prime-banned or blocked end is not offered', () => {
    // fevga.md #12: only 24/20 is legal, so 24/19 and 23/19 are not offered.
    const p1 = fevgaState('w: 24x9 23x2 22 21 20 2 ; b: 6 5 4 3 2 24x10');
    expect(fevga.nextMoves(p1, [5, 4], []).map(formatMove)).toEqual(['24/20']);
    // fevga.md #15: 24/23 would end in a full block with the 6, so it is not offered.
    const block = fevgaState('w: 24x10 5 4 3 2 1 ; b: 18 24x14');
    expect(fevga.nextMoves(block, [6, 1], []).map(formatMove)).toEqual([
      '24/18',
      '5/4',
      '4/3',
      '3/2',
      '2/1',
    ]);
  });

  it('in random positions, step by step reaches exactly the end positions of legalTurns', () => {
    const quarter = resolveRules('fevga', { movement: { runnerTarget: 'reachQuarter' } });
    randomFevgaPositions(4242, 150, 3).forEach((position, i) => {
      const dice = position.dice as Dice;
      const state = { ...position, rules: i % 5 === 0 ? quarter : position.rules, dice: null };
      const listed = fevga.legalTurns(state, dice);
      const expected = new Set(
        listed.map((t) => formatFevgaPosition(fevga.applyTurn(state, t).board)),
      );
      const { finals, sequences } = walk(state, dice);
      expect(finals).toEqual(expected);
      for (const moves of sequences) {
        // Every walked sequence is a turn applyTurn accepts, with the same board.
        const turn = { player: state.toMove, dice, moves };
        expect(fevga.applyTurn(state, turn).board).toEqual(boardAfter(state, moves));
      }
      // Every listed play can be played one move at a time.
      for (const turn of listed) {
        turn.moves.forEach((move, j) => {
          const options = fevga.nextMoves(state, dice, turn.moves.slice(0, j));
          expect(
            options.some((m) => formatMove(m) === formatMove(move) && m.die === move.die),
          ).toBe(true);
        });
      }
    });
    // About 1 s on a fast machine. Give CI runners (2 cores, shared) room.
  }, 30_000);
});
