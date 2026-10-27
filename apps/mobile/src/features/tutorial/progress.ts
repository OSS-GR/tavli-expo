/**
 * Has the player seen the tutorial (#128)? Home offers "Learn to play"
 * until they finish it or say no.
 *
 * - `new`: not seen yet. Home shows the card.
 * - `dismissed`: closed the card on Home, or skipped the tutorial.
 * - `done`: played it to the end.
 *
 * Saved through the `Storage` port. It is not personal data and is never
 * sent anywhere, so it needs no consent. It is kept apart from Settings,
 * so "reset settings" does not bring the card back.
 */
import type { Storage } from '@tavli/contracts';
import { createStore } from 'zustand/vanilla';

export type TutorialStatus = 'new' | 'dismissed' | 'done';

/** Storage key. The saved value is `{ version, status }` JSON. */
export const TUTORIAL_STORAGE_KEY = 'tutorial';
const TUTORIAL_VERSION = 1;

export interface TutorialState {
  readonly status: TutorialStatus;
  /** The card was closed, or the tutorial skipped. Never undoes `done`. */
  dismiss: () => void;
  /** The tutorial was played to the end. */
  finish: () => void;
}

/** The saved status. A missing or broken save is `new`. */
function load(storage: Storage): TutorialStatus {
  const raw = storage.getString(TUTORIAL_STORAGE_KEY);
  if (raw === undefined) return 'new';
  try {
    const saved: unknown = JSON.parse(raw);
    const status = (saved as { status?: unknown } | null)?.status;
    return status === 'dismissed' || status === 'done' ? status : 'new';
  } catch {
    return 'new';
  }
}

/** A tutorial store saved in `storage`. The saved status is loaded before this returns. */
export function createTutorialStore(storage: Storage) {
  return createStore<TutorialState>()((set, get) => {
    const save = (status: TutorialStatus) => {
      try {
        storage.setString(
          TUTORIAL_STORAGE_KEY,
          JSON.stringify({ version: TUTORIAL_VERSION, status }),
        );
      } catch (error) {
        // The card may show again next time; nothing else breaks.
        console.warn('tutorial status not saved', error);
      }
      set({ status });
    };
    return {
      status: load(storage),
      dismiss: () => {
        if (get().status === 'new') save('dismissed');
      },
      finish: () => {
        if (get().status !== 'done') save('done');
      },
    };
  });
}

export type TutorialStore = ReturnType<typeof createTutorialStore>;

/** Home offers the tutorial only until it is finished or dismissed. */
export function offersTutorial(status: TutorialStatus): boolean {
  return status === 'new';
}
