/**
 * The board step of the welcome flow (#350): after the consent answer, a
 * new player picks the board theme, the home side and the board layout.
 * It shows once.
 *
 * - `new`: the player has never answered consent on this phone. The step
 *   comes after the first answer.
 * - `due`: the player answered consent, but has not passed the board step
 *   yet (also when the app closed in between). The welcome flow shows it.
 * - `done`: the player passed the step, or passed the welcome flow before
 *   the step existed.
 *
 * A player who updates the app has a saved consent answer and no saved
 * step: that loads as `done`, so they never see it. Saved through the
 * `Storage` port, apart from Settings, so "reset settings" cannot bring
 * the step back.
 */
import type { Storage } from '@tavli/contracts';
import { createStore } from 'zustand/vanilla';

import { CONSENT_STORAGE_KEY } from '@/features/privacy/consent';

export type BoardStepStatus = 'new' | 'due' | 'done';

/** Storage key. The saved value is `due` or `done`. */
export const WELCOME_BOARD_STORAGE_KEY = 'welcomeBoard';

export interface BoardStepState {
  readonly status: BoardStepStatus;
  /**
   * Call right before the first consent answer is saved: the step is due
   * from then on. Does nothing once the step is due or done.
   */
  begin: () => void;
  /** The player tapped Continue on the board step. */
  finish: () => void;
}

function load(storage: Storage): BoardStepStatus {
  const raw = storage.getString(WELCOME_BOARD_STORAGE_KEY);
  if (raw === 'due' || raw === 'done') return raw;
  // Any consent answer saved, even for an older consent text: the player
  // passed the welcome flow before the board step existed.
  return storage.getString(CONSENT_STORAGE_KEY) === undefined ? 'new' : 'done';
}

/** A board step store saved in `storage`. The saved status is loaded before this returns. */
export function createBoardStepStore(storage: Storage) {
  return createStore<BoardStepState>()((set, get) => ({
    status: load(storage),
    begin: () => {
      if (get().status !== 'new') return;
      storage.setString(WELCOME_BOARD_STORAGE_KEY, 'due');
      set({ status: 'due' });
    },
    finish: () => {
      storage.setString(WELCOME_BOARD_STORAGE_KEY, 'done');
      set({ status: 'done' });
    },
  }));
}

export type BoardStepStore = ReturnType<typeof createBoardStepStore>;
