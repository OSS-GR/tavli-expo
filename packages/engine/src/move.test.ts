import { describe, expect, it } from 'vitest';

import { formatMove, formatTurn, locationNumber, sameTurn } from './move';
import type { Turn } from './move';

describe('move notation', () => {
  it('writes moves like the rules docs', () => {
    expect(formatMove({ from: 24, to: 18, die: 6, capture: 'none' })).toBe('24/18');
    expect(formatMove({ from: 'bar', to: 22, die: 3, capture: 'none' })).toBe('25/22');
    expect(formatMove({ from: 'outside', to: 24, die: 1, capture: 'none' })).toBe('25/24');
    expect(formatMove({ from: 4, to: 'off', die: 6, capture: 'none' })).toBe('4/0');
    expect(formatMove({ from: 13, to: 8, die: 5, capture: 'hit' })).toBe('13/8*');
    expect(formatMove({ from: 13, to: 8, die: 5, capture: 'pin' })).toBe('13/8*');
  });

  it('writes a pass as -', () => {
    expect(formatTurn({ player: 'white', dice: [6, 6], moves: [] })).toBe('-');
  });

  it('maps special locations to 25 and 0', () => {
    expect(locationNumber('bar')).toBe(25);
    expect(locationNumber('outside')).toBe(25);
    expect(locationNumber('off')).toBe(0);
    expect(locationNumber(7)).toBe(7);
  });
});

describe('sameTurn', () => {
  const turn: Turn = {
    player: 'white',
    dice: [5, 3],
    moves: [
      { from: 13, to: 8, die: 5, capture: 'hit' },
      { from: 8, to: 5, die: 3, capture: 'none' },
    ],
  };

  it('is true for an equal copy', () => {
    expect(sameTurn(turn, JSON.parse(JSON.stringify(turn)) as Turn)).toBe(true);
  });

  it('is false when the order, a flag, the dice or the player differ', () => {
    expect(sameTurn(turn, { ...turn, moves: [...turn.moves].reverse() })).toBe(false);
    expect(sameTurn(turn, { ...turn, player: 'black' })).toBe(false);
    expect(sameTurn(turn, { ...turn, dice: [3, 5] })).toBe(false);
    expect(sameTurn(turn, { ...turn, moves: turn.moves.slice(0, 1) })).toBe(false);
    const [first, second] = turn.moves;
    if (first === undefined || second === undefined) throw new Error('no moves');
    expect(sameTurn(turn, { ...turn, moves: [{ ...first, capture: 'none' }, second] })).toBe(false);
  });
});
