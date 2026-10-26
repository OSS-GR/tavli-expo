/** The app's local matches, with dice from `services.ts`. */
import { createLocalRng } from '@/services';

import { createSessionRegistry } from './sessions';

export const matchSessions = createSessionRegistry({ createRng: createLocalRng });
