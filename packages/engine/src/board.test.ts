import { describe, expect, it } from 'vitest';

import {
  checkersAt,
  checkersOnPoints,
  createBoard,
  emptyBoard,
  pipCount,
  pointAt,
  totalCheckers,
} from './board';
import { EngineError } from './errors';
import { PLAYERS } from './player';
import { positionKey } from './state';
import { START_POSITIONS, makeState, startBoard } from './testing/fixtures';
import { validateBoard } from './validate';

describe('start positions', () => {
  it.each([
    ['portes', 167],
    ['plakoto', 360],
    ['fevga', 360],
    ['asodio', 375],
  ] as const)('%s: pip count is %i for both players', (game, pips) => {
    const board = startBoard(game);
    const { direction } = START_POSITIONS[game];
    for (const player of PLAYERS) {
      expect(pipCount(board, player, direction)).toBe(pips);
      expect(totalCheckers(board, player)).toBe(15);
    }
  });

  it("portes: Black is on White's 1, 12, 17, 19 (2/5/3/5)", () => {
    const board = startBoard('portes');
    expect([1, 12, 17, 19].map((p) => pointAt(board, p).black)).toEqual([2, 5, 3, 5]);
    expect([24, 13, 8, 6].map((p) => pointAt(board, p).white)).toEqual([2, 5, 3, 5]);
    expect(checkersAt(board, 'black', 13, 'contrary')).toBe(5);
  });

  it('plakoto: White 15 on W24, Black 15 on W1', () => {
    const board = startBoard('plakoto');
    expect(pointAt(board, 24)).toEqual({ white: 15, black: 0, pinned: null });
    expect(pointAt(board, 1)).toEqual({ white: 0, black: 15, pinned: null });
  });

  it('fevga: White 15 on W24, Black 15 on W12 (diagonal corners)', () => {
    const board = startBoard('fevga');
    expect(pointAt(board, 24).white).toBe(15);
    expect(pointAt(board, 12).black).toBe(15);
    expect(checkersOnPoints(board, 'black')).toBe(15);
  });

  it('asodio: all 30 checkers outside, board empty', () => {
    const board = startBoard('asodio');
    expect(board.outside).toEqual({ white: 15, black: 15 });
    expect(board.points.every((p) => p.white === 0 && p.black === 0)).toBe(true);
  });
});

describe('pip count', () => {
  it('counts bar and outside as 25, off as 0, pinned checkers as normal', () => {
    const board = createBoard(
      {
        white: { points: { 3: 1, 10: 2 }, bar: 1, outside: 1, off: 10 },
        black: { points: { 2: 14 }, off: 1 },
      },
      'contrary',
    );
    expect(pipCount(board, 'white', 'contrary')).toBe(3 + 20 + 25 + 25);
    expect(pipCount(board, 'black', 'contrary')).toBe(14 * 2);
  });

  it('a pinned checker still counts its pips', () => {
    // White's lone checker on own 20 (= Black's 5) is pinned by two Black checkers.
    const board = createBoard(
      {
        white: { points: { 20: 1, 24: 14 }, pinned: [20] },
        black: { points: { 5: 2, 24: 13 } },
      },
      'contrary',
    );
    expect(pointAt(board, 20)).toEqual({ white: 1, black: 2, pinned: 'white' });
    expect(pipCount(board, 'white', 'contrary')).toBe(20 + 14 * 24);
  });
});

describe('createBoard', () => {
  it('rejects a player with the wrong number of checkers', () => {
    expect(() =>
      createBoard({ white: { points: { 24: 14 } }, black: { points: { 24: 15 } } }, 'contrary'),
    ).toThrow(EngineError);
  });

  it('rejects two players on one point without a pin', () => {
    expect(() =>
      createBoard({ white: { points: { 1: 15 } }, black: { points: { 24: 15 } } }, 'contrary'),
    ).toThrow(/pinned/);
  });

  it('rejects a bad own point number', () => {
    expect(() =>
      createBoard({ white: { points: { 25: 15 } }, black: { points: { 24: 15 } } }, 'contrary'),
    ).toThrow(expect.objectContaining({ code: 'OUT_OF_RANGE' }));
  });

  it('an empty board is not a valid game board', () => {
    expect(() => validateBoard(emptyBoard())).toThrow(/0 checkers/);
  });

  it('pointAt rejects numbers outside 1–24', () => {
    expect(() => pointAt(startBoard('portes'), 0)).toThrow(EngineError);
    expect(() => pointAt(startBoard('portes'), 25)).toThrow(EngineError);
  });
});

describe('positionKey', () => {
  it('is the same for the same position and player, whatever the dice or turn', () => {
    const a = makeState();
    const b = makeState({ dice: [3, 1], turnNumber: 7 });
    expect(positionKey(a)).toBe(positionKey(b));
  });

  it('changes with the player to move, the board and the variant', () => {
    const a = makeState();
    expect(positionKey(makeState({ toMove: 'black' }))).not.toBe(positionKey(a));
    expect(positionKey(makeState({ board: startBoard('plakoto') }))).not.toBe(positionKey(a));
    expect(positionKey(makeState({ variant: 'plakoto' }))).not.toBe(positionKey(a));
  });
});
