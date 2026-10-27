/** The app's tutorial store (#128), saved through the `Storage` port. */
import { useStore } from 'zustand';

import { storage } from '@/services';

import { createTutorialStore, type TutorialState } from './progress';

export const tutorialStore = createTutorialStore(storage);

/** Reads the tutorial status in a component. */
export function useTutorial<T>(selector: (state: TutorialState) => T): T {
  return useStore(tutorialStore, selector);
}
