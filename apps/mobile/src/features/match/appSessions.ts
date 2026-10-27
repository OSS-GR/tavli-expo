/** The app's local matches, with dice from `services.ts` and game events (#61). */
import { createGameAnalytics } from '@/features/analytics/gameAnalytics';
import { createLocalRng } from '@/services';

import { createSessionRegistry } from './sessions';

export const matchSessions = createSessionRegistry({
  createRng: createLocalRng,
  createAnalytics: (setup) =>
    createGameAnalytics(
      setup.mode === 'bot' ? { mode: 'bot', botLevel: setup.botLevel } : { mode: 'local' },
    ),
});
