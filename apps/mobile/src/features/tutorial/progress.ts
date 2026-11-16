/**
 * Has the player seen the tutorial? Saved per lesson set: Portes (#128),
 * Plakoto and Fevga (#149), Asodio (#159). Home offers "Learn to play"
 * (Portes only) until they finish it or say no.
 *
 * - `new`: not seen yet. Home shows the card.
 * - `dismissed`: closed the card on Home, or skipped the tutorial.
 * - `done`: played it to the end.
 *
 * It also keeps how many lessons in a row were learnt (`learnt`, #571), so
 * How to play shows "1 of 4" and its Continue opens the next lesson.
 *
 * Saved through the `Storage` port. It is not personal data and is never
 * sent anywhere, so it needs no consent. It is kept apart from Settings,
 * so "reset settings" does not bring the card back.
 *
 * Storage: Portes keeps the key it had before #149 (`tutorial`), so a
 * saved status stays valid. The other games each have their own key
 * (`tutorial.plakoto`, `tutorial.fevga`, `tutorial.asodio`) with the same
 * `{ version, status, learnt? }` JSON (`learnt` only when not 0). A new game only adds a key, so the keys saved
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
  /** How many lessons in a row were learnt, per set (#571). */
  readonly learnt: { readonly [G in TutorialGame]: number };
  /** Lesson `step` (from 1) was learnt. Only a higher step counts. */
  learn: (game: TutorialGame, step: number) => void;
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

interface Saved {
  readonly status: TutorialStatus;
  readonly learnt: number;
}

/** The saved status. A missing or broken save is `new`, with nothing learnt. */
function load(storage: Storage, game: TutorialGame): Saved {
  const raw = storage.getString(tutorialStorageKey(game));
  if (raw === undefined) return { status: 'new', learnt: 0 };
  try {
    const saved = JSON.parse(raw) as { status?: unknown; learnt?: unknown } | null;
    const status = saved?.status;
    const learnt = saved?.learnt;
    return {
      status: status === 'dismissed' || status === 'done' ? status : 'new',
      learnt: typeof learnt === 'number' && Number.isInteger(learnt) && learnt > 0 ? learnt : 0,
    };
  } catch {
    return { status: 'new', learnt: 0 };
  }
}

/** A tutorial store saved in `storage`. The saved statuses are loaded before this returns. */
export function createTutorialStore(storage: Storage) {
  return createStore<TutorialState>()((set, get) => {
    const save = (
      game: TutorialGame,
      status: TutorialStatus,
      learnt: number = get().learnt[game],
    ) => {
      try {
        storage.setString(
          tutorialStorageKey(game),
          JSON.stringify(
            learnt > 0
              ? { version: TUTORIAL_VERSION, status, learnt }
              : { version: TUTORIAL_VERSION, status },
          ),
        );
      } catch (error) {
        // The card may show again next time; nothing else breaks.
        console.warn('tutorial status not saved', error);
      }
      const learntNow = { ...get().learnt, [game]: learnt };
      if (game === 'portes') set({ status, learnt: learntNow });
      else set({ variants: { ...get().variants, [game]: status }, learnt: learntNow });
    };
    const saved = {
      portes: load(storage, 'portes'),
      plakoto: load(storage, 'plakoto'),
      fevga: load(storage, 'fevga'),
      asodio: load(storage, 'asodio'),
    };
    return {
      status: saved.portes.status,
      variants: {
        plakoto: saved.plakoto.status,
        fevga: saved.fevga.status,
        asodio: saved.asodio.status,
      },
      learnt: {
        portes: saved.portes.learnt,
        plakoto: saved.plakoto.learnt,
        fevga: saved.fevga.learnt,
        asodio: saved.asodio.learnt,
      },
      learn: (game, step) => {
        const which = gameOf(game);
        if (step > get().learnt[which]) save(which, statusOf(get(), which), step);
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

/** A lesson set's status and how many lessons in a row were learnt (#571). */
export interface LessonProgress {
  readonly status: TutorialStatus;
  readonly learnt: number;
}

/** What How to play offers for a lesson set (#571). */
export type LessonsOffer =
  | { readonly kind: 'start' }
  | { readonly kind: 'continue'; readonly next: number }
  | { readonly kind: 'again' };

/**
 * Start, Continue at the next lesson (0-based `next`), or Play again when
 * the set is done or every lesson was learnt.
 */
export function lessonsOffer(status: TutorialStatus, learnt: number, count: number): LessonsOffer {
  if (status === 'done' || learnt >= count) return { kind: 'again' };
  return learnt > 0 ? { kind: 'continue', next: learnt } : { kind: 'start' };
}

/** Lessons learnt, for the progress line: all of them once the set is done. */
export function lessonsLearnt(status: TutorialStatus, learnt: number, count: number): number {
  return status === 'done' ? count : Math.min(learnt, count);
}
