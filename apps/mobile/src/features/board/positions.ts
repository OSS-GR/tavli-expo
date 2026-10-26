/**
 * Fixed Portes positions for the dev board screen, tests and screenshots.
 * Each side is written in that player's own numbering (24 = start).
 */
import { createBoard, type BoardState } from '@tavli/engine';

export type SamplePositionId = 'start' | 'midgame' | 'bearoff';

export const SAMPLE_POSITION_IDS: readonly SamplePositionId[] = ['start', 'midgame', 'bearoff'];

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
};
