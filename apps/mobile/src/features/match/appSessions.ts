/**
 * The app's local matches: dice from `services.ts`, saved in its `Storage`,
 * with game events (#61).
 */
import { createGameAnalytics } from '@/features/analytics/gameAnalytics';
import { botLevels, createLocalRng, storage } from '@/services';

import { createSessionRegistry } from './sessions';

export const matchSessions = createSessionRegistry({
  createRng: createLocalRng,
  storage,
  levels: botLevels,
  createAnalytics: (setup) =>
    createGameAnalytics(
      setup.mode === 'bot' ? { mode: 'bot', botLevel: setup.botLevel } : { mode: 'local' },
    ),
});
