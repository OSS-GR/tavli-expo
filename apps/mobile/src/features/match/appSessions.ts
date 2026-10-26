/** The app's local matches: dice from `services.ts`, saved in its `Storage`. */
import { botLevels, createLocalRng, storage } from '@/services';

import { createSessionRegistry } from './sessions';

export const matchSessions = createSessionRegistry({
  createRng: createLocalRng,
  storage,
  levels: botLevels,
});
