// Runs in each test file after the test framework is set up
// (`setupFilesAfterEnv` in jest.config.js).

import { resetAnnouncements } from '../src/features/game/useAnnouncement';
import { resetTurnPushesForTest } from '../src/features/notifications/appTurnPushes';
import { forgetPushTapsForTest } from '../src/features/notifications/pushTaps';
import { forgetOnlineAccount } from '../src/features/online/accountHint';
import { forgetDevGamesForTest } from '../src/features/online/devGameIds';

import { resetOnlineFake } from './onlineFake';

// `useAnnouncement` reads a keyed game event once per app run (#216). In
// tests one file is one app run, so each test starts with nothing read.
beforeEach(() => {
  resetAnnouncements();
});

// Online play (`auth`, `games`, `onlineServer` of `@/services`): each test
// starts with a new in-memory server, nobody signed in, no dev games and
// no note of an online account on the phone (#297).
beforeEach(() => {
  resetOnlineFake();
  forgetDevGamesForTest();
  forgetOnlineAccount();
  // Turn notifications (#285): a new instance on the reset fakes, and no tap opened yet.
  resetTurnPushesForTest();
  forgetPushTapsForTest();
});
