/**
 * The reminder schedule of this phone (#404), saved through the `Storage`
 * port under `REMINDERS_STORAGE_KEY`. The rules are in `schedule.ts`.
 *
 * The saved value holds only times and a count: no id, no account. It
 * never leaves the phone and never goes to analytics. A storage error is
 * no problem: the reminders are only a nudge, so the phone then asks less.
 */
import type { Storage } from '@tavli/contracts';

import { storage as appStorage } from '@/services';

import * as schedule from './schedule';
import type { ReminderState } from './schedule';

/** Storage key. The saved value is a `ReminderState` as JSON. */
export const REMINDERS_STORAGE_KEY = 'saveReminders';

export interface Reminders {
  /** The saved state. */
  state(): ReminderState;
  /** The first "Continue as a guest", or "Not now" on Play a friend's sheet. */
  start(): void;
  /** The sign-in sheet showed again (an online tap). */
  sheetShown(): void;
  /** The turn-notification offer showed. */
  otherPrompt(): void;
  /** True when a card is due now. */
  due(): boolean;
  /** A card showed: uses the ask that is due. */
  ask(): void;
  /** A key sign-in, or "Don't ask again": no more asks. */
  stop(): void;
}

export function createReminders(storage: Storage, now: () => number = () => Date.now()): Reminders {
  const load = (): ReminderState => {
    try {
      return schedule.parseReminders(storage.getString(REMINDERS_STORAGE_KEY));
    } catch {
      return schedule.NO_REMINDERS;
    }
  };
  const update = (step: (state: ReminderState) => ReminderState) => {
    const before = load();
    const after = step(before);
    if (after === before) return;
    try {
      storage.setString(REMINDERS_STORAGE_KEY, JSON.stringify(after));
    } catch {
      // Only a nudge: the next visit reads the old state.
    }
  };
  return {
    state: load,
    start: () => update((s) => schedule.start(s, now())),
    sheetShown: () => update((s) => schedule.sheetShown(s, now())),
    otherPrompt: () => update((s) => schedule.otherPrompt(s, now())),
    due: () => schedule.askDue(load(), now()),
    ask: () => update((s) => schedule.ask(s, now())),
    stop: () => update(schedule.stop),
  };
}

/** The app's reminders, on the app's storage. */
export const reminders = createReminders(appStorage);

/** Tests only: forget the saved schedule. */
export function resetRemindersForTest(): void {
  appStorage.remove(REMINDERS_STORAGE_KEY);
}
