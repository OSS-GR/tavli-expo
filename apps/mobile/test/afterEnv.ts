// Runs in each test file after the test framework is set up
// (`setupFilesAfterEnv` in jest.config.js).

import { resetRaceOffersForTest } from '../src/features/game/raceOffer';
import { resetAnnouncements } from '../src/features/game/useAnnouncement';
import { resetTurnPushesForTest } from '../src/features/notifications/appTurnPushes';
import { forgetPushTapsForTest } from '../src/features/notifications/pushTaps';
import { forgetOnlineAccount } from '../src/features/online/accountHint';
import { forgetDevGamesForTest } from '../src/features/online/devGameIds';
import { resetRemindersForTest } from '../src/features/reminders/reminders';
import { resetUpdateCheckForTest } from '../src/features/update/updateCheck';
import { markWhatsNewSeenForTest } from '../src/features/whats-new/seen';

import { resetOnlineFake } from './onlineFake';

// `useAnnouncement` reads a keyed game event once per app run (#216). In
// tests one file is one app run, so each test starts with nothing read.
// The race card is answered once per game for the app run too.
beforeEach(() => {
  resetAnnouncements();
  resetRaceOffersForTest();
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
  // Update needed (#390): no answer and no online game screen yet.
  resetUpdateCheckForTest();
  // Save reminders (#404): no first choice yet.
  resetRemindersForTest();
  // What's new (#471): every release seen, so Home shows no card.
  markWhatsNewSeenForTest();
});
