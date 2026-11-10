import {
  ASK_COUNT,
  DAY_MS,
  LAST_GAP_MS,
  NO_REMINDERS,
  ask,
  askDue,
  isLastAsk,
  nextAskAt,
  otherPrompt,
  parseReminders,
  sheetShown,
  start,
  stop,
  type ReminderState,
} from './schedule';

const T0 = Date.UTC(2026, 10, 1, 12);
const HOUR = 60 * 60 * 1000;

function started(at = T0): ReminderState {
  return start(NO_REMINDERS, at);
}

/** Visits Home at `at`: the state after it, and whether a card showed. */
function visit(state: ReminderState, at: number): { state: ReminderState; shown: boolean } {
  if (!askDue(state, at)) return { state, shown: false };
  return { state: ask(state, at), shown: true };
}

describe('the reminder schedule (#404)', () => {
  it('asks nothing before the first choice', () => {
    expect(nextAskAt(NO_REMINDERS)).toBeNull();
    expect(askDue(NO_REMINDERS, T0 + 400 * DAY_MS)).toBe(false);
    expect(ask(NO_REMINDERS, T0 + 400 * DAY_MS)).toBe(NO_REMINDERS);
  });

  it('starts once, at the first choice', () => {
    const first = started();
    expect(first.start).toBe(T0);
    expect(start(first, T0 + 5 * DAY_MS)).toBe(first);
  });

  it('asks at 24 hours, 1 week, 2 weeks and 1 month, then never', () => {
    let state = started();
    const shownAt: number[] = [];
    // A visit each hour for 60 days.
    for (let at = T0; at <= T0 + 60 * DAY_MS; at += HOUR) {
      const next = visit(state, at);
      if (next.shown) shownAt.push(at - T0);
      state = next.state;
    }
    expect(shownAt).toEqual([DAY_MS, 7 * DAY_MS, 14 * DAY_MS, 30 * DAY_MS]);
    expect(state.asked).toBe(ASK_COUNT);
    expect(nextAskAt(state)).toBeNull();
  });

  it('shows at most one card a day', () => {
    let state = visit(started(), T0 + DAY_MS).state;
    // The 1-week step is due, but the player comes back the next day only.
    state = { ...state, start: T0 - 7 * DAY_MS };
    expect(askDue(state, T0 + DAY_MS + 23 * HOUR)).toBe(false);
    expect(askDue(state, T0 + 2 * DAY_MS)).toBe(true);
  });

  it('counts a card after a long gap as the latest step due, never the last', () => {
    // Back after a month with no ask yet: one card, the 2-week one.
    const back = T0 + 31 * DAY_MS;
    let next = visit(started(), back);
    expect(next.shown).toBe(true);
    expect(next.state.asked).toBe(ASK_COUNT - 1);
    // The same day: nothing more.
    expect(visit(next.state, back + HOUR).shown).toBe(false);
    // The last card comes at least 2 weeks later, on its own visit.
    expect(isLastAsk(next.state)).toBe(true);
    expect(nextAskAt(next.state)).toBe(back + LAST_GAP_MS);
    expect(visit(next.state, back + LAST_GAP_MS - HOUR).shown).toBe(false);
    next = visit(next.state, back + LAST_GAP_MS);
    expect(next.shown).toBe(true);
    expect(next.state.asked).toBe(ASK_COUNT);
    expect(nextAskAt(next.state)).toBeNull();
  });

  it('counts a card after a shorter gap as the latest step due', () => {
    // First card at 24 h, then back after 3 weeks: that card is the 2-week one.
    let state = visit(started(), T0 + DAY_MS).state;
    state = visit(state, T0 + 21 * DAY_MS).state;
    expect(state.asked).toBe(3);
    // The last one: 1 month after the start is too soon (one week later).
    expect(nextAskAt(state)).toBe(T0 + 21 * DAY_MS + LAST_GAP_MS);
  });

  it('keeps the 1-month step when the 2-week card came on time', () => {
    let state = started();
    for (const at of [1, 7, 14]) state = visit(state, T0 + at * DAY_MS).state;
    expect(state.asked).toBe(3);
    expect(nextAskAt(state)).toBe(T0 + 30 * DAY_MS);
  });

  it('never shows a card early when the clock moved back', () => {
    let state = visit(started(), T0 + DAY_MS).state;
    // The clock jumps back a year: nothing is due, at any time before the saved times.
    for (let at = T0 - 365 * DAY_MS; at < T0 + 7 * DAY_MS; at += 6 * HOUR) {
      expect(askDue(state, at)).toBe(false);
    }
    // A clock that moved back before the first card: no card before 24 h after the start.
    state = started();
    expect(askDue(state, T0 - DAY_MS)).toBe(false);
    expect(askDue(state, T0 + DAY_MS - 1)).toBe(false);
    // The sheet seen with a clock set back does not move the other prompt back.
    const prompted = otherPrompt(otherPrompt(started(), T0 + 2 * DAY_MS), T0);
    expect(prompted.otherAt).toBe(T0 + 2 * DAY_MS);
  });

  it('counts the sheet as the ask when one is due', () => {
    const state = sheetShown(started(), T0 + DAY_MS);
    expect(state.asked).toBe(1);
    // No card the same day.
    expect(askDue(state, T0 + DAY_MS + HOUR)).toBe(false);
    expect(nextAskAt(state)).toBe(T0 + 7 * DAY_MS);
  });

  it('holds the cards back for a day when the sheet shows and no ask is due', () => {
    // The 24-hour card is due at T0 + 1 day; the sheet showed 2 hours before.
    const state = sheetShown(started(), T0 + DAY_MS - 2 * HOUR);
    expect(state.asked).toBe(0);
    expect(nextAskAt(state)).toBe(T0 + 2 * DAY_MS - 2 * HOUR);
  });

  it('shows no card on the day of the turn-notification offer', () => {
    const state = otherPrompt(started(), T0 + DAY_MS);
    expect(askDue(state, T0 + DAY_MS + 23 * HOUR)).toBe(false);
    expect(askDue(state, T0 + 2 * DAY_MS)).toBe(true);
  });

  it('ignores the sheet and other prompts before the first choice', () => {
    expect(sheetShown(NO_REMINDERS, T0)).toBe(NO_REMINDERS);
    expect(otherPrompt(NO_REMINDERS, T0)).toBe(NO_REMINDERS);
  });

  it('stops for good', () => {
    const state = stop(started());
    expect(nextAskAt(state)).toBeNull();
    expect(askDue(state, T0 + 400 * DAY_MS)).toBe(false);
    expect(start(stop(NO_REMINDERS), T0).start).toBeNull();
  });

  it('reads back what it saves, and ignores what it cannot read', () => {
    const state = visit(started(), T0 + DAY_MS).state;
    expect(parseReminders(JSON.stringify(state))).toEqual(state);
    expect(parseReminders(undefined)).toEqual(NO_REMINDERS);
    expect(parseReminders('not json')).toEqual(NO_REMINDERS);
    expect(parseReminders('{"start":"x","asked":99,"stopped":"yes"}')).toEqual({
      ...NO_REMINDERS,
      asked: ASK_COUNT,
    });
  });
});
