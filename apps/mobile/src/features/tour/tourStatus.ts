/**
 * The first-run tour (#573): after the welcome flow, Home opens the tour
 * once, on a new install only.
 *
 * - `new`: the player has never answered consent on this phone.
 * - `due`: the player answered consent for the first time on this build,
 *   and has not finished or skipped the tour yet (also when the app
 *   closed in between). Home opens it the next time it shows.
 * - `done`: the player finished or skipped the tour, or passed the
 *   welcome flow before the tour existed.
 *
 * A player who updates the app has a saved consent answer and no saved
 * status: that loads as `done`, so the tour never opens by itself for
 * them (What's new tells them about it). Saved through the `Storage`
 * port, apart from Settings, so "reset settings" cannot bring it back.
 * It never leaves the phone and never goes to analytics.
 */
import type { Storage } from '@tavli/contracts';
import { createStore } from 'zustand/vanilla';

import { CONSENT_STORAGE_KEY } from '@/features/privacy/consent';

export type TourStatus = 'new' | 'due' | 'done';

/** Storage key. The saved value is `due` or `done`. */
export const TOUR_STORAGE_KEY = 'appTour';

export interface TourState {
  readonly status: TourStatus;
  /**
   * Call right before the first consent answer is saved: the tour is due
   * from then on. Does nothing once the tour is due or done.
   */
  begin: () => void;
  /** The player finished or skipped the tour. */
  finish: () => void;
}

function read(storage: Storage, key: string): string | undefined {
  try {
    return storage.getString(key);
  } catch {
    return undefined;
  }
}

function load(storage: Storage): TourStatus {
  const raw = read(storage, TOUR_STORAGE_KEY);
  if (raw === 'due' || raw === 'done') return raw;
  // Any consent answer saved: the player came before the tour.
  return read(storage, CONSENT_STORAGE_KEY) === undefined ? 'new' : 'done';
}

function save(storage: Storage, status: 'due' | 'done') {
  try {
    storage.setString(TOUR_STORAGE_KEY, status);
  } catch {
    // The tour may open once more: no harm.
  }
}

/** A tour status store saved in `storage`. The saved status is loaded before this returns. */
export function createTourStore(storage: Storage) {
  return createStore<TourState>()((set, get) => ({
    status: load(storage),
    begin: () => {
      if (get().status !== 'new') return;
      save(storage, 'due');
      set({ status: 'due' });
    },
    finish: () => {
      save(storage, 'done');
      set({ status: 'done' });
    },
  }));
}

export type TourStore = ReturnType<typeof createTourStore>;
