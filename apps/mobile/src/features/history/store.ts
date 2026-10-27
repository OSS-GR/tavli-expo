/** The app's match history (#142), saved in the app's `Storage`. */
import { useStore } from 'zustand';

import { storage } from '@/services';

import { createHistoryStore, type HistoryState } from './historyStore';

export const historyStore = createHistoryStore(storage);

/** Reads the history in a component. */
export function useHistory<T>(selector: (state: HistoryState) => T): T {
  return useStore(historyStore, selector);
}
