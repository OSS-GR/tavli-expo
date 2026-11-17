import { createMemoryStorage } from '@tavli/contracts';

import { NO_REMINDERS, type ReminderState } from '@/features/reminders/schedule';

import { DAY_MS } from './schedule';
import { SUPPORT_ASK_STORAGE_KEY, createSupportAsk } from './supportAsk';

function setup(reminderState: Partial<ReminderState> = {}) {
  const storage = createMemoryStorage();
  let time = 1_000 * DAY_MS;
  const reminders = { state: () => ({ ...NO_REMINDERS, ...reminderState }) };
  const ask = createSupportAsk(storage, reminders, () => time);
  return {
    storage,
    ask,
    move: (ms: number) => {
      time += ms;
    },
    now: () => time,
  };
}

describe('createSupportAsk', () => {
  it('shows the card after the second won game and saves the state', () => {
    const { ask, storage, now } = setup();
    expect(ask.countGames(1, true)).toBe(false);
    expect(ask.countGames(1, true)).toBe(true);
    expect(ask.state()).toEqual({ games: 0, asked: true, lastAskAt: now(), stopped: false });
    expect(JSON.parse(storage.getString(SUPPORT_ASK_STORAGE_KEY) ?? '{}')).toEqual(ask.state());
  });

  it('never shows after a loss, and the loss keeps the ask for the next win', () => {
    const { ask } = setup();
    ask.countGames(1, true);
    expect(ask.countGames(1, false)).toBe(false);
    expect(ask.state().asked).toBe(false);
    expect(ask.countGames(1, true)).toBe(true);
  });

  it('holds the card back on a day with a save reminder or another prompt', () => {
    const today = setup({ otherAt: 1_000 * DAY_MS - 60_000 });
    today.ask.countGames(1, true);
    expect(today.ask.countGames(1, true)).toBe(false);
    today.move(DAY_MS);
    expect(today.ask.countGames(1, true)).toBe(true);

    const reminder = setup({ lastAskAt: 1_000 * DAY_MS });
    reminder.ask.countGames(1, true);
    expect(reminder.ask.countGames(1, true)).toBe(false);
  });

  it('"Not now" starts the count again, "Don\'t ask again" stops it', () => {
    const { ask, move } = setup();
    ask.countGames(2, true);
    ask.notNow();
    move(8 * DAY_MS);
    expect(ask.countGames(9, true)).toBe(false);
    expect(ask.countGames(1, true)).toBe(true);
    ask.stop();
    move(30 * DAY_MS);
    expect(ask.countGames(20, true)).toBe(false);
    expect(ask.state().stopped).toBe(true);
  });

  it('reads a broken saved value as a new phone', () => {
    const { ask, storage } = setup();
    storage.setString(SUPPORT_ASK_STORAGE_KEY, '{nope');
    expect(ask.state().games).toBe(0);
    expect(ask.countGames(2, true)).toBe(true);
  });
});
