/**
 * The support ask of this phone (#590), saved through the `Storage` port
 * under `SUPPORT_ASK_STORAGE_KEY`. The rules are in `schedule.ts`.
 *
 * The saved value holds only a count, a time and two flags: no id, no
 * account. It never leaves the phone and never goes to analytics. A
 * storage error is no problem: the ask is only a nudge, so the phone then
 * asks less.
 *
 * `useSupportAsk` counts each finished game once per app run (a remount
 * of the end screen does not count it again) and says whether its card
 * is open. The store reads `Date.now()` at each call, so fake timers move
 * it.
 */
import type { Storage } from '@tavli/contracts';
import { useEffect, useEffectEvent } from 'react';
import { create } from 'zustand';

import { reminders as appReminders, type Reminders } from '@/features/reminders/reminders';
import { storage as appStorage } from '@/services';

import * as schedule from './schedule';
import { DAY_MS, type SupportAskState } from './schedule';
import {
  sendSupportAskAnswered,
  sendSupportAskShown,
  type SupportAskAnswer,
} from './supportAnalytics';

/** Storage key. The saved value is a `SupportAskState` as JSON. */
export const SUPPORT_ASK_STORAGE_KEY = 'supportAsk';

export interface SupportAsk {
  /** The saved state. */
  state(): SupportAskState;
  /** Counts finished games; true when the card shows now. */
  countGames(count: number, won: boolean): boolean;
  /** "Not now". */
  notNow(): void;
  /** "Don't ask again". */
  stop(): void;
}

export function createSupportAsk(
  storage: Storage,
  reminders: Pick<Reminders, 'state'>,
  now: () => number = () => Date.now(),
): SupportAsk {
  const load = (): SupportAskState => {
    try {
      return schedule.parseSupportAsk(storage.getString(SUPPORT_ASK_STORAGE_KEY));
    } catch {
      return schedule.NEW_SUPPORT_ASK;
    }
  };
  const save = (state: SupportAskState) => {
    try {
      storage.setString(SUPPORT_ASK_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Only a nudge: the next game reads the old state.
    }
  };
  const update = (step: (state: SupportAskState) => SupportAskState) => {
    const before = load();
    const after = step(before);
    if (after !== before) save(after);
  };
  // A save reminder or another prompt today holds the card back (two
  // cards never on the same day). It waits, like after a loss.
  const otherCardToday = (time: number): boolean => {
    const { lastAskAt, otherAt } = reminders.state();
    return [lastAskAt, otherAt].some((at) => at !== null && time >= at && time < at + DAY_MS);
  };
  return {
    state: load,
    countGames: (count, won) => {
      const time = now();
      const before = load();
      const next = schedule.countGames(before, {
        count,
        mayShow: won && !otherCardToday(time),
        now: time,
      });
      if (next.state !== before) save(next.state);
      return next.ask;
    },
    notNow: () => update(schedule.notNow),
    stop: () => update(schedule.stop),
  };
}

/** The app's support ask, on the app's storage. */
export const supportAsk = createSupportAsk(appStorage, appReminders);

/** The end screens that counted their game in this app run: `open` while the card shows. */
const useRuns = create<{ readonly ends: Readonly<Record<string, 'open' | 'closed'>> }>(() => ({
  ends: {},
}));

export interface SupportAskCardState {
  /** True while the card shows. */
  readonly open: boolean;
  /** The player's answer: closes the card. */
  readonly answer: (answer: SupportAskAnswer) => void;
}

/**
 * Counts a finished game (`games` of them for a ranked match) once per
 * `key` and app run, and shows the card when it is due. `key` `null`: no
 * game to count (a game in play, the tutorial, an online friend game).
 * `won`: the player won (pass-and-play: a person won, which is always,
 * but a draw).
 */
export function useSupportAsk(
  key: string | null,
  { games, won }: { games: number; won: boolean },
): SupportAskCardState {
  const count = useEffectEvent((end: string) => {
    if (useRuns.getState().ends[end] !== undefined) return;
    const show = supportAsk.countGames(games, won);
    useRuns.setState((s) => ({ ends: { ...s.ends, [end]: show ? 'open' : 'closed' } }));
    if (show) {
      // The save reminders on Home hold back for a day (#404).
      appReminders.otherPrompt();
      sendSupportAskShown();
    }
  });
  useEffect(() => {
    if (key !== null) count(key);
  }, [key]);
  const open = useRuns((s) => key !== null && s.ends[key] === 'open');
  return {
    open,
    answer: (answer) => {
      if (key === null) return;
      useRuns.setState((s) => ({ ends: { ...s.ends, [key]: 'closed' } }));
      if (answer === 'not_now') supportAsk.notNow();
      if (answer === 'never') supportAsk.stop();
      sendSupportAskAnswered(answer);
    },
  };
}

/**
 * Tests: `never` (the default in `test/afterEnv.ts`) saves "Don't ask
 * again", so no end screen shows the card; `new` is a new phone. Both
 * forget the end screens counted in this app run.
 */
export function resetSupportAskForTest(mode: 'never' | 'new'): void {
  useRuns.setState({ ends: {} });
  appStorage.remove(SUPPORT_ASK_STORAGE_KEY);
  if (mode === 'never') supportAsk.stop();
}
