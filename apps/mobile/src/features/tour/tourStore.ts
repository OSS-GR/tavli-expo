/** The app's tour status store (#573): see `tourStatus.ts`. */
import { storage } from '@/services';

import { createTourStore } from './tourStatus';

export const tourStore = createTourStore(storage);

/** Tests: the tour as on a phone that never answered consent. */
export function resetTourForTest(status: 'new' | 'done' = 'new') {
  tourStore.setState({ status });
}
