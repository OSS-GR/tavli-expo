import { describe, expect, it } from 'vitest';

import { formatTurn } from '../move';
import { startBoard } from './fixtures';
import { formatPosition, parsePosition, parseTurn, portesState } from './position-notation';

describe('position notation (test helper)', () => {
  it('reads the Portes start position in each side’s own numbering', () => {
    expect(parsePosition('w: 24x2 13x5 8x3 6x5 ; b: 24x2 13x5 8x3 6x5')).toEqual(
      startBoard('portes'),
    );
  });

  it('round-trips to the canonical form', () => {
    const text = 'b: 1 20x2 ; w: offx10 2 bar 6x3';
    const board = parsePosition(text);
    expect(formatPosition(board)).toBe('w: 6x3 2 bar offx10 ; b: 20x2 1 offx12');
    expect(parsePosition(formatPosition(board))).toEqual(board);
  });

  it('puts the missing checkers off', () => {
    const board = parsePosition('w: 6 ; b: 6x15');
    expect(board.off).toEqual({ white: 14, black: 0 });
  });

  it('rejects bad text', () => {
    expect(() => parsePosition('w: 6x15')).toThrow('both sides');
    expect(() => parsePosition('w: 25 ; b: 6x15')).toThrow('not 1 to 24');
    expect(() => parsePosition('w: 6x16 ; b: 6x15')).toThrow('more than 15');
    expect(() => parsePosition('w: 6x15 ; b: 6x15 ; w: 1')).toThrow('twice');
    expect(() => parsePosition('x: 6x15 ; b: 6x15')).toThrow('unknown side');
    expect(() => parsePosition('w: 6y15 ; b: 6x15')).toThrow('bad token');
    // Both players on one point (White 6 = Black 19).
    expect(() => parsePosition('w: 6x15 ; b: 19x15')).toThrow();
  });

  it('builds a state and parses turns', () => {
    const state = portesState('w: 6x15 ; b: 6x15', { toMove: 'black', dice: [4, 2] });
    expect(state).toMatchObject({ variant: 'portes', toMove: 'black', dice: [4, 2] });
    const turn = parseTurn('25/21* 6/0:6 13/11', 'white', [6, 4]);
    expect(turn.moves).toEqual([
      { from: 'bar', to: 21, die: 4, capture: 'hit' },
      { from: 6, to: 'off', die: 6, capture: 'none' },
      { from: 13, to: 11, die: 2, capture: 'none' },
    ]);
    expect(formatTurn(parseTurn('-', 'white', [6, 4]))).toBe('-');
    expect(() => parseTurn('13-11', 'white', [6, 4])).toThrow('bad move');
    expect(() => parseTurn('13/4', 'white', [6, 4])).toThrow('bad die');
  });
});
