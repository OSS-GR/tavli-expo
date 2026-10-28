// Runs in each test file after the test framework is set up
// (`setupFilesAfterEnv` in jest.config.js).

import { resetAnnouncements } from '../src/features/game/useAnnouncement';
import { forgetDevGamesForTest } from '../src/features/online/devGameIds';

import { resetOnlineFake } from './onlineFake';

// `useAnnouncement` reads a keyed game event once per app run (#216). In
// tests one file is one app run, so each test starts with nothing read.
beforeEach(() => {
  resetAnnouncements();
});

// Online play (`auth`, `games`, `onlineServer` of `@/services`): each test
// starts with a new in-memory server, nobody signed in and no dev games.
beforeEach(() => {
  resetOnlineFake();
  forgetDevGamesForTest();
});
