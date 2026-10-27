/**
 * The match history store (#142), saved through the `Storage` port
 * (`records.ts` has the format). A storage error only logs: the list in
 * memory is still right, and the next save tries again.
 */
import type { Storage } from '@tavli/contracts';
import { createStore } from 'zustand/vanilla';

import {
  HISTORY_STORAGE_KEY,
  MAX_HISTORY_RECORDS,
  addRecord,
  parseHistory,
  hasMatchRecord,
  serializeHistory,
  type HistoryRecord,
} from './records';

export interface HistoryState {
  /** Newest first. */
  readonly records: readonly HistoryRecord[];
  add: (record: HistoryRecord) => void;
  /** Is this match of the session in the history (`hasMatchRecord`)? */
  hasMatch: (sessionId: string, matchNumber: number) => boolean;
  /** Deletes every record. */
  clear: () => void;
}

function load(storage: Storage): HistoryRecord[] {
  try {
    return parseHistory(storage.getString(HISTORY_STORAGE_KEY));
  } catch (error) {
    console.warn('could not read the match history', error);
    return [];
  }
}

/** A history store saved in `storage`. The saved records are loaded before this returns. */
export function createHistoryStore(storage: Storage, max: number = MAX_HISTORY_RECORDS) {
  return createStore<HistoryState>()((set, get) => ({
    records: load(storage),
    add: (record) => {
      const records = addRecord(get().records, record, max);
      set({ records });
      try {
        storage.setString(HISTORY_STORAGE_KEY, serializeHistory(records));
      } catch (error) {
        console.warn('could not save the match history', error);
      }
    },
    hasMatch: (sessionId, matchNumber) => hasMatchRecord(get().records, sessionId, matchNumber),
    clear: () => {
      set({ records: [] });
      try {
        storage.remove(HISTORY_STORAGE_KEY);
      } catch (error) {
        // Clear is a privacy control: if remove fails, overwrite with an
        // empty history so the old records do not come back on restart.
        console.warn('could not remove the match history; writing an empty one', error);
        try {
          storage.setString(HISTORY_STORAGE_KEY, serializeHistory([]));
        } catch (writeError) {
          console.warn('could not clear the match history', writeError);
        }
      }
    },
  }));
}

export type HistoryStore = ReturnType<typeof createHistoryStore>;
