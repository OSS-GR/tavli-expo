/**
 * Fixed positions for the dev board screen, tests and screenshots.
 * Each side is written in that player's own numbering (24 = start).
 *
 * Portes, Plakoto and Asodio number Black's points the other way round from
 * White's (`contrary`); Fevga numbers them the same way round (`parallel`).
 * `SAMPLE_DIRECTIONS` says which one each position uses.
 */
import {
  ASODIO_START,
  FEVGA_START,
  PLAKOTO_START,
  createBoard,
  type BoardState,
  type Direction,
} from '@tavli/engine';

export type SamplePositionId =
  | 'start'
  | 'midgame'
  | 'bearoff'
  | 'plakotoStart'
  | 'plakotoPins'
  | 'fevgaStart'
  | 'asodioStart'
  | 'asodioLoading'
  | 'asodioFrozen';

export const SAMPLE_POSITION_IDS: readonly SamplePositionId[] = [
  'start',
  'midgame',
  'bearoff',
  'plakotoStart',
  'plakotoPins',
  'fevgaStart',
  'asodioStart',
  'asodioLoading',
  'asodioFrozen',
];

export const SAMPLE_DIRECTIONS: Readonly<Record<SamplePositionId, Direction>> = {
  start: 'contrary',
  midgame: 'contrary',
  bearoff: 'contrary',
  plakotoStart: 'contrary',
  plakotoPins: 'contrary',
  fevgaStart: 'parallel',
  asodioStart: 'contrary',
  asodioLoading: 'contrary',
  asodioFrozen: 'contrary',
};

export const SAMPLE_POSITIONS: Readonly<Record<SamplePositionId, BoardState>> = {
  // The Portes start: 2/5/3/5 on own 24/13/8/6.
  start: createBoard(
    {
      white: { points: { 24: 2, 13: 5, 8: 3, 6: 5 } },
      black: { points: { 24: 2, 13: 5, 8: 3, 6: 5 } },
    },
    'contrary',
  ),
  // A tall stack (count badge), a checker on the bar and a few borne off.
  midgame: createBoard(
    {
      white: { points: { 6: 7, 8: 3, 13: 2, 2: 2 }, bar: 1 },
      black: { points: { 6: 3, 5: 2, 4: 2, 3: 2, 2: 1, 1: 1 }, off: 4 },
    },
    'contrary',
  ),
  // Both players bear off.
  bearoff: createBoard(
    {
      white: { points: { 6: 2, 5: 3, 4: 2, 3: 1, 1: 1 }, off: 6 },
      black: { points: { 6: 1, 4: 2, 2: 2, 1: 8 }, off: 2 },
    },
    'contrary',
  ),
  // The Plakoto start: 15 on own 24, in opposite corners on the same side.
  plakotoStart: createBoard({ white: PLAKOTO_START, black: PLAKOTO_START }, 'contrary'),
  // Two pins: Black pins White's mother (White 24 = Black 1), and two White
  // checkers pin a Black checker on Black's 15 (= White 10).
  plakotoPins: createBoard(
    {
      white: { points: { 24: 1, 20: 3, 16: 3, 10: 2, 8: 3, 5: 3 }, pinned: [24] },
      black: { points: { 24: 4, 19: 3, 15: 1, 12: 3, 7: 3, 1: 1 }, pinned: [15] },
    },
    'contrary',
  ),
  // The Fevga start: 15 on own 24, in diagonally opposite corners
  // (White 24 = Black 12).
  fevgaStart: createBoard({ white: FEVGA_START, black: FEVGA_START }, 'parallel'),
  // The Asodio start: the board is empty, all 15 of each player wait to enter.
  asodioStart: createBoard({ white: ASODIO_START, black: ASODIO_START }, 'contrary'),
  // White is loading: 7 entered on spots 1-3 (own 24-22), 8 still to enter.
  asodioLoading: createBoard(
    {
      white: { points: { 24: 2, 23: 1, 22: 4 }, outside: 8 },
      black: { outside: 15 },
    },
    'contrary',
  ),
  // A6: Black pins White's lagging checker on White 20 (Black 5). White's
  // other 14 are in the next quarter, so they are frozen: White passes.
  // Black's checker on own 5 is in front of Black's rear quarter: frozen too.
  asodioFrozen: createBoard(
    {
      white: { points: { 20: 1, 18: 5, 16: 5, 14: 4 }, pinned: [20] },
      black: { points: { 12: 4, 10: 5, 8: 5, 5: 1 } },
    },
    'contrary',
  ),
};
