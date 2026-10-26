/**
 * Test helpers. Not exported from the package.
 *
 * Start positions from `docs/rules/*.md`, written in each player's own view.
 * The real variants (#23 and later) own their start positions; these copies
 * only check the board model and the numbering helpers.
 */

import { createBoard } from '../board';
import type { BoardState, SideLayout } from '../board';
import type { Direction } from '../numbering';
import { getPreset } from '../presets';
import { GAME_STATE_SCHEMA_VERSION } from '../state';
import type { GameState } from '../state';

const PORTES_SIDE: SideLayout = { points: { 24: 2, 13: 5, 8: 3, 6: 5 } };
const ALL_ON_24: SideLayout = { points: { 24: 15 } };
const ALL_OUTSIDE: SideLayout = { outside: 15 };

export const START_POSITIONS: Record<
  'portes' | 'plakoto' | 'fevga' | 'asodio',
  { direction: Direction; side: SideLayout }
> = {
  portes: { direction: 'contrary', side: PORTES_SIDE },
  plakoto: { direction: 'contrary', side: ALL_ON_24 },
  fevga: { direction: 'parallel', side: ALL_ON_24 },
  asodio: { direction: 'contrary', side: ALL_OUTSIDE },
};

export function startBoard(game: keyof typeof START_POSITIONS): BoardState {
  const { direction, side } = START_POSITIONS[game];
  return createBoard({ white: side, black: side }, direction);
}

/** A valid Portes start state. Pass fields to override. */
export function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    variant: 'portes',
    rules: getPreset('portes'),
    board: startBoard('portes'),
    toMove: 'white',
    dice: null,
    turnNumber: 1,
    variantData: null,
    ...overrides,
  };
}
