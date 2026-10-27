/**
 * Has the player seen the tutorial? Saved per lesson set: Portes (#128),
 * Plakoto and Fevga (#149), Asodio (#159). Home offers "Learn to play"
 * (Portes only) until they finish it or say no.
 *
 * - `new`: not seen yet. Home shows the card.
 * - `dismissed`: closed the card on Home, or skipped the tutorial.
 * - `done`: played it to the end.
 *
 * Saved through the `Storage` port. It is not personal data and is never
 * sent anywhere, so it needs no consent. It is kept apart from Settings,
 * so "reset settings" does not bring the card back.
 *
 * Storage: Portes keeps the key it had before #149 (`tutorial`), so a
 * saved status stays valid. The other games each have their own key
 * (`tutorial.plakoto`, `tutorial.fevga`, `tutorial.asodio`) with the same
 * `{ version, status }` JSON. A new game only adds a key, so the keys saved
 * before it still load.
 */
import type { Storage, TutorialGame } from '@tavli/contracts';
import { createStore } from 'zustand/vanilla';

export type TutorialStatus = 'new' | 'dismissed' | 'done';

/** Storage key of the Portes tutorial. The saved value is `{ version, status }` JSON. */
export const TUTORIAL_STORAGE_KEY = 'tutorial';
const TUTORIAL_VERSION = 1;

/** The storage key of a lesson set. Portes keeps the first key (`tutorial`). */
export function tutorialStorageKey(game: TutorialGame): string {
  return game === 'portes' ? TUTORIAL_STORAGE_KEY : `${TUTORIAL_STORAGE_KEY}.${game}`;
}

/** The lesson sets that are not Portes. */
export type VariantTutorialGame = Exclude<TutorialGame, 'portes'>;

export interface TutorialState {
  /** The Portes tutorial: the one the Home card offers. */
  readonly status: TutorialStatus;
  /** The Plakoto and Fevga lessons (#149), and Asodio (#159). */
  readonly variants: { readonly [G in VariantTutorialGame]: TutorialStatus };
  /** The card was closed, or the tutorial skipped. Never undoes `done`. Default: Portes. */
  dismiss: (game?: TutorialGame) => void;
  /** The tutorial was played to the end. Default: Portes. */
  finish: (game?: TutorialGame) => void;
}

/** The status of one lesson set. */
export function statusOf(state: Pick<TutorialState, 'status' | 'variants'>, game: TutorialGame) {
  return game === 'portes' ? state.status : state.variants[game];
}

/** The lesson sets with their own key, in the order of the games. */
export const VARIANT_TUTORIAL_GAMES: readonly VariantTutorialGame[] = [
  'plakoto',
  'fevga',
  'asodio',
];

/**
 * The lesson set a call is about. Anything but another lesson set is
 * Portes, so `onPress={dismiss}` (a press event as the argument) still
 * means Portes.
 */
function gameOf(game: unknown): TutorialGame {
  return VARIANT_TUTORIAL_GAMES.find((g) => g === game) ?? 'portes';
}

/** The saved status. A missing or broken save is `new`. */
function load(storage: Storage, game: TutorialGame): TutorialStatus {
  const raw = storage.getString(tutorialStorageKey(game));
  if (raw === undefined) return 'new';
  try {
    const saved: unknown = JSON.parse(raw);
    const status = (saved as { status?: unknown } | null)?.status;
    return status === 'dismissed' || status === 'done' ? status : 'new';
  } catch {
    return 'new';
  }
}

/** A tutorial store saved in `storage`. The saved statuses are loaded before this returns. */
export function createTutorialStore(storage: Storage) {
  return createStore<TutorialState>()((set, get) => {
    const save = (game: TutorialGame, status: TutorialStatus) => {
      try {
        storage.setString(
          tutorialStorageKey(game),
          JSON.stringify({ version: TUTORIAL_VERSION, status }),
        );
      } catch (error) {
        // The card may show again next time; nothing else breaks.
        console.warn('tutorial status not saved', error);
      }
      if (game === 'portes') set({ status });
      else set({ variants: { ...get().variants, [game]: status } });
    };
    return {
      status: load(storage, 'portes'),
      variants: {
        plakoto: load(storage, 'plakoto'),
        fevga: load(storage, 'fevga'),
        asodio: load(storage, 'asodio'),
      },
      dismiss: (game) => {
        const which = gameOf(game);
        if (statusOf(get(), which) === 'new') save(which, 'dismissed');
      },
      finish: (game) => {
        const which = gameOf(game);
        if (statusOf(get(), which) !== 'done') save(which, 'done');
      },
    };
  });
}

export type TutorialStore = ReturnType<typeof createTutorialStore>;

/** Home offers the tutorial only until it is finished or dismissed. */
export function offersTutorial(status: TutorialStatus): boolean {
  return status === 'new';
}
