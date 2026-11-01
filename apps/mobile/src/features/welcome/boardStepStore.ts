/** The app's board step store (#350): see `boardStep.ts`. */
import { useStore } from 'zustand';

import { storage } from '@/services';

import { createBoardStepStore, type BoardStepState } from './boardStep';

export const boardStepStore = createBoardStepStore(storage);

/** Reads the board step status in a component. */
export function useBoardStep<T>(selector: (state: BoardStepState) => T): T {
  return useStore(boardStepStore, selector);
}
