import { describe, expect, it } from 'vitest';

import { applyMoveToBoard } from '../../board';
import type { Dice } from '../../dice';
import { formatMove, formatTurn } from '../../move';
import type { Move } from '../../move';
import { positionKey } from '../../state';
import type { GameState } from '../../state';
import { resolveRules } from '../../presets';
import { formatPosition, parseTurn, portesState } from '../../testing/position-notation';
import { randomPositions } from '../../testing/random-positions';
import { portes } from './index';

function next(state: GameState, dice: Dice, played: readonly Move[] = []): string[] {
  return portes.nextMoves(state, dice, played).map(formatMove);
}

/**
 * Every full sequence `nextMoves` allows, walked one move at a time. Sub-states
 * with the same board and the same number of moves played are walked once.
 */
function walk(state: GameState, dice: Dice): { finals: Set<string>; sequences: Move[][] } {
  const finals = new Set<string>();
  const sequences: Move[][] = [];
  const seen = new Set<string>();
  const go = (played: Move[]): void => {
    const options = portes.nextMoves(state, dice, played);
    if (options.length === 0) {
      sequences.push(played);
      const board = played.reduce(
        (b, m) => applyMoveToBoard(b, state.toMove, m, 'contrary'),
        state.board,
      );
      finals.add(formatPosition(board));
      return;
    }
    for (const move of options) {
      const after = [...played, move];
      const board = after.reduce(
        (b, m) => applyMoveToBoard(b, state.toMove, m, 'contrary'),
        state.board,
      );
      const key = `${positionKey({ ...state, board })}|${after.map((m) => m.die).join('')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      go(after);
    }
  };
  go([]);
  return { finals, sequences };
}

describe('Portes nextMoves (one move at a time)', () => {
  it('allows any order of a legal play, not only the listed one (6-1: 13/12 12/6)', () => {
    const state = portesState('w: 13x15 ; b: 1x15');
    expect(portes.legalTurns(state, [6, 1]).map(formatTurn)).toContain('13/7 7/6');
    expect(next(state, [6, 1])).toEqual(['13/7', '13/12']);
    const after1 = parseTurn('13/12', 'white', [6, 1]).moves;
    expect(next(state, [6, 1], after1)).toEqual(['13/7', '12/6']);
    const done = parseTurn('13/12 12/6', 'white', [6, 1]).moves;
    expect(next(state, [6, 1], done)).toEqual([]);
  });

  // #179: a checker leaves a door (πόρτα), hits a blot, and plays the other die.
  it('after a hit, the same checker may play the other die, in both dice orders', () => {
    // White's door on 13. Black blots on White's 8 (Black's 17) or 10 (Black's 15).
    const by5 = portesState('w: 13x2 6x13 ; b: 17 24x14');
    const by3 = portesState('w: 13x2 6x13 ; b: 15 24x14');
    for (const dice of [
      [5, 3],
      [3, 5],
    ] as Dice[]) {
      expect(portes.legalTurns(by5, dice).map(formatTurn)).toContain('13/8* 8/5');
      expect(next(by5, dice)).toContain('13/8*');
      expect(next(by5, dice, parseTurn('13/8*', 'white', dice).moves)).toContain('8/5');
      expect(next(by5, dice, parseTurn('13/8* 8/5', 'white', dice).moves)).toEqual([]);

      expect(portes.legalTurns(by3, dice).map(formatTurn)).toContain('13/10* 10/5');
      expect(next(by3, dice)).toContain('13/10*');
      expect(next(by3, dice, parseTurn('13/10*', 'white', dice).moves)).toContain('10/5');
    }
  });

  it('after a hit from the bar, the entered checker may play the other die', () => {
    // portes.md hitting rule 6: enter (and hit), then any checker may move.
    const state = portesState('w: bar 6x14 ; b: 5 1x14');
    expect(next(state, [5, 3])).toContain('25/20*');
    expect(next(state, [5, 3], parseTurn('25/20*', 'white', [5, 3]).moves)).toContain('20/17');
  });

  it('rejects a legal single move that would leave the rest of the roll unplayable', () => {
    // 7/1 (6) is legal alone, but then no 5 can be played. 20/14/9 plays both dice.
    const state = portesState('w: 24x13 20 7 ; b: 23x2 10x2 7x2 6x2 3x7');
    expect(portes.legalTurns(state, [6, 5]).map(formatTurn)).toEqual(['20/14 14/9']);
    expect(next(state, [6, 5])).toEqual(['20/14']);
  });

  it('keeps the higher die rule: if only one die can be played, it must be the higher one', () => {
    // tavli-match.md #10: either die alone, but not both → must play the 6.
    const state = portesState('w: 13x14 10 ; b: 18x2 17x2 24x11');
    expect(next(state, [6, 5])).toEqual(['10/4']);
    expect(next(state, [6, 5], parseTurn('10/4', 'white', [6, 5]).moves)).toEqual([]);
  });

  it('lists nothing for a pass and throws for moves that are not a legal prefix', () => {
    const blocked = portesState('w: bar 13x14 ; b: 6x2 5x2 4x2 3x2 2x2 1x2 24x3');
    expect(next(blocked, [4, 2])).toEqual([]);
    const state = portesState('w: 24x13 20 7 ; b: 23x2 10x2 7x2 6x2 3x7');
    const bad = parseTurn('7/1', 'white', [6, 5]).moves;
    expect(() => portes.nextMoves(state, [6, 5], bad)).toThrow(
      expect.objectContaining({ code: 'ILLEGAL_TURN' }),
    );
    expect(() =>
      portes.nextMoves(state, [6, 5], parseTurn('20/15', 'white', [6, 5]).moves),
    ).toThrow(expect.objectContaining({ code: 'ILLEGAL_TURN' }));
  });

  it('in random positions, step by step reaches exactly the end positions of legalTurns', () => {
    const noHitAndRun = resolveRules('portes', { capture: { noHitAndRunInHome: true } });
    randomPositions(4242, 200, 3).forEach((position, i) => {
      const dice = position.dice as Dice;
      // Every fourth position also checks the noHitAndRunInHome flag.
      const rules = i % 4 === 0 ? noHitAndRun : position.rules;
      const state = { ...position, rules, dice: null };
      const listed = portes.legalTurns(state, dice);
      const expected = new Set(listed.map((t) => formatPosition(portes.applyTurn(state, t).board)));
      const { finals, sequences } = walk(state, dice);
      expect(finals).toEqual(expected);
      for (const moves of sequences) {
        // Every walked sequence is a turn applyTurn accepts, with the same board.
        const turn = { player: state.toMove, dice, moves };
        const board = moves.reduce(
          (b, m) => applyMoveToBoard(b, state.toMove, m, 'contrary'),
          state.board,
        );
        expect(portes.applyTurn(state, turn).board).toEqual(board);
      }
      // Every listed play can be played one move at a time.
      for (const turn of listed) {
        turn.moves.forEach((move, j) => {
          const options = portes.nextMoves(state, dice, turn.moves.slice(0, j));
          expect(
            options.some((m) => formatMove(m) === formatMove(move) && m.die === move.die),
          ).toBe(true);
        });
      }
    });
    // About 3 s on a fast machine. Give CI runners (2 cores, shared) room.
  }, 30_000);
});
