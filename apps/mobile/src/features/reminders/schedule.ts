/**
 * When Home asks again to save a guest account or to play online (#404,
 * ADR-0008 point 7). Pure: every call takes the time.
 *
 * - The clock starts at the player's first "Continue as a guest", or the
 *   first "Not now" on the sign-in sheet of Play a friend (`start`).
 * - Four asks at most: 24 hours, 1 week, 2 weeks and 1 month after that
 *   first choice (`STEP_AFTER_MS`), then never.
 * - At most one ask a day (`DAY_MS` after the last one).
 * - A player back after a long gap gets one ask, which counts as the latest
 *   step due, but never as the last one: the last ask comes at least
 *   `LAST_GAP_MS` (2 weeks) after the one before.
 * - The sign-in sheet that shows again counts as an ask when one is due
 *   (`sheetShown`); otherwise it only holds the cards back for a day. So
 *   does the turn-notification offer (`otherPrompt`).
 * - A clock that moved back never brings an ask early: every due time is
 *   after the saved times, so an earlier "now" only waits longer.
 * - `stop`: the player signed in with a key, or tapped "Don't ask again".
 *
 * The state is kept only on the phone (`reminders.ts`): never on the
 * server, never in analytics.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** When each ask is due, after the first choice. */
export const STEP_AFTER_MS = [DAY_MS, 7 * DAY_MS, 14 * DAY_MS, 30 * DAY_MS] as const;

/** The number of asks. */
export const ASK_COUNT = STEP_AFTER_MS.length;

/** The last ask comes at least this long after the ask before it. */
export const LAST_GAP_MS = 14 * DAY_MS;

export interface ReminderState {
  /** The time of the first choice, or `null` before it. */
  readonly start: number | null;
  /** How many asks were used (0 to `ASK_COUNT`). */
  readonly asked: number;
  /** The time of the last ask (a card, or the sheet when an ask was due). */
  readonly lastAskAt: number | null;
  /** The time of the last other prompt (the sheet or the turn-notification offer). */
  readonly otherAt: number | null;
  /** No more asks: the player signed in with a key, or said "Don't ask again". */
  readonly stopped: boolean;
}

export const NO_REMINDERS: ReminderState = {
  start: null,
  asked: 0,
  lastAskAt: null,
  otherAt: null,
  stopped: false,
};

/** Starts the clock at the first choice. Later choices change nothing. */
export function start(state: ReminderState, now: number): ReminderState {
  if (state.start !== null || state.stopped) return state;
  return { ...state, start: now };
}

/** No more asks. */
export function stop(state: ReminderState): ReminderState {
  return state.stopped ? state : { ...state, stopped: true };
}

/** When ask `index` (from 0) is due, after the first choice. */
function stepAfter(index: number): number {
  return STEP_AFTER_MS[index] ?? STEP_AFTER_MS[3];
}

/** When the next ask is due, or `null` when none will come. */
export function nextAskAt(state: ReminderState): number | null {
  const { start: first, asked, lastAskAt, otherAt, stopped } = state;
  if (stopped || first === null || asked >= ASK_COUNT) return null;
  let due =
    asked < ASK_COUNT - 1
      ? first + stepAfter(asked)
      : Math.max(first + stepAfter(asked), (lastAskAt ?? first) + LAST_GAP_MS);
  if (lastAskAt !== null) due = Math.max(due, lastAskAt + DAY_MS);
  if (otherAt !== null) due = Math.max(due, otherAt + DAY_MS);
  return due;
}

/** True when an ask is due now. */
export function askDue(state: ReminderState, now: number): boolean {
  const due = nextAskAt(state);
  return due !== null && now >= due;
}

/** True when the next ask is the last one. */
export function isLastAsk(state: ReminderState): boolean {
  return state.asked === ASK_COUNT - 1;
}

/**
 * Uses the ask that is due now. After a long gap it counts as the latest
 * step due, but never as the last one. Does nothing when no ask is due.
 */
export function ask(state: ReminderState, now: number): ReminderState {
  const first = state.start;
  if (first === null || !askDue(state, now)) return state;
  let asked = state.asked + 1;
  if (state.asked < ASK_COUNT - 1) {
    const reached = STEP_AFTER_MS.filter((after) => now >= first + after).length;
    asked = Math.max(asked, Math.min(reached, ASK_COUNT - 1));
  }
  return { ...state, asked, lastAskAt: now };
}

/**
 * The sign-in sheet showed (an online tap). It counts as the ask when one
 * is due; either way, no card comes the same day.
 */
export function sheetShown(state: ReminderState, now: number): ReminderState {
  if (state.start === null || state.stopped) return state;
  return otherPrompt(ask(state, now), now);
}

/** Another prompt showed (the turn-notification offer): no card the same day. */
export function otherPrompt(state: ReminderState, now: number): ReminderState {
  if (state.start === null || state.stopped) return state;
  return { ...state, otherAt: Math.max(state.otherAt ?? now, now) };
}

/** Reads a saved state. Anything it cannot read gives `NO_REMINDERS`. */
export function parseReminders(raw: string | undefined): ReminderState {
  if (raw === undefined) return NO_REMINDERS;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof ReminderState, unknown>>;
    const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const asked =
      typeof value.asked === 'number' && Number.isInteger(value.asked)
        ? Math.min(Math.max(value.asked, 0), ASK_COUNT)
        : 0;
    return {
      start: time(value.start),
      asked,
      lastAskAt: time(value.lastAskAt),
      otherAt: time(value.otherAt),
      stopped: value.stopped === true,
    };
  } catch {
    return NO_REMINDERS;
  }
}
