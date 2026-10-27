// Runs in each test file after the test framework is set up
// (`setupFilesAfterEnv` in jest.config.js).

import { resetAnnouncements } from '../src/features/game/useAnnouncement';

// `useAnnouncement` reads a keyed game event once per app run (#216). In
// tests one file is one app run, so each test starts with nothing read.
beforeEach(() => {
  resetAnnouncements();
});
