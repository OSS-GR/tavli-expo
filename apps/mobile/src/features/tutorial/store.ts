/** The app's tutorial store (#128), saved through the `Storage` port. */
import type { TutorialGame } from '@tavli/contracts';
import { useStore } from 'zustand';

import { storage } from '@/services';

import { createTutorialStore, type LessonProgress, type TutorialState } from './progress';

export const tutorialStore = createTutorialStore(storage);

/** Reads the tutorial status in a component. */
export function useTutorial<T>(selector: (state: TutorialState) => T): T {
  return useStore(tutorialStore, selector);
}

/** Each lesson set's status and lessons learnt (How to play, #571). */
export function useLessonProgress(): { readonly [G in TutorialGame]: LessonProgress } {
  // Each selector returns a value that keeps its identity, so no render loop.
  const status = useTutorial((s) => s.status);
  const variants = useTutorial((s) => s.variants);
  const learnt = useTutorial((s) => s.learnt);
  return {
    portes: { status, learnt: learnt.portes },
    plakoto: { status: variants.plakoto, learnt: learnt.plakoto },
    fevga: { status: variants.fevga, learnt: learnt.fevga },
    asodio: { status: variants.asodio, learnt: learnt.asodio },
  };
}
