import { CHAT_MAX_LENGTH, type ChatMessage } from '@tavli/contracts';
import { hasBadWord, hasLink } from '@tavli/online';

import el from '@/i18n/el.json';
import en from '@/i18n/en.json';

import {
  CHAT_PEEK_LENGTH,
  CHAT_PEEK_MAX_MS,
  CHAT_PEEK_MS,
  CHAT_PEEK_REPEAT_MS,
  nextPeek,
  peekMs,
  peekText,
} from './ChatPeek';
import {
  CHAT_GROUP_GAP_MS,
  CHAT_PHRASES,
  CHAT_TIME_QUIET_MS,
  chatRows,
  dayLabel,
} from './chatLayout';

const message = (id: string, from: 'white' | 'black', sentAt: number, game = 1): ChatMessage => ({
  id,
  from,
  text: id,
  sentAt,
  game,
});

/** The phone time of the tests: the same day as the test messages (near time 0). */
const NOW = 10 * 60 * 1000;

describe('chatRows', () => {
  it('ends a group when the other player writes', () => {
    const rows = chatRows(
      [message('a', 'white', 0), message('b', 'white', 1000), message('c', 'black', 2000)],
      'white',
      NOW,
    );
    expect(rows.map((row) => [row.mine, row.last])).toEqual([
      [true, false],
      [true, true],
      [false, true],
    ]);
  });

  it('ends a group after a long wait', () => {
    const rows = chatRows(
      [message('a', 'white', 0), message('b', 'white', CHAT_GROUP_GAP_MS + 1)],
      'black',
      NOW,
    );
    expect(rows.map((row) => row.last)).toEqual([true, true]);
  });

  it('keeps a group over a wait of exactly the gap', () => {
    const rows = chatRows(
      [message('a', 'white', 0), message('b', 'white', CHAT_GROUP_GAP_MS)],
      'black',
      NOW,
    );
    expect(rows.map((row) => row.last)).toEqual([false, true]);
  });

  it('shows one time at the end of a fast talk', () => {
    const rows = chatRows(
      [
        message('a', 'white', 0),
        message('b', 'black', 5000),
        message('c', 'white', 5000 + CHAT_TIME_QUIET_MS + 1),
      ],
      'white',
      NOW,
    );
    expect(rows.map((row) => row.time)).toEqual([false, true, true]);
  });

  it('draws a line where a new game starts, and ends the group before it', () => {
    const rows = chatRows(
      [
        message('a', 'white', 0),
        message('b', 'white', 1000),
        message('c', 'white', 2000, 2),
        message('d', 'black', 3000, 2),
      ],
      'white',
      NOW,
    );
    expect(rows.map((row) => row.gameLine)).toEqual([null, null, 2, null]);
    expect(rows.map((row) => row.last)).toEqual([false, true, true, true]);
    expect(rows[1]?.time).toBe(true);
  });

  it('draws a line over the first message when it is not from game 1', () => {
    expect(chatRows([message('a', 'white', 0, 3)], 'white', NOW)[0]?.gameLine).toBe(3);
    expect(chatRows([message('a', 'white', 0)], 'white', NOW)[0]?.gameLine).toBeNull();
  });

  it('gives no rows for no messages', () => {
    expect(chatRows([], 'white', NOW)).toEqual([]);
  });
});

describe('the ready phrases', () => {
  it.each([
    ['English', en.chat.phrases],
    ['Greek', el.chat.phrases],
  ])('pass the chat checks in %s', (_, phrases) => {
    for (const key of CHAT_PHRASES) {
      const text = phrases[key];
      expect(text.trim()).not.toBe('');
      expect(Array.from(text).length).toBeLessThanOrEqual(CHAT_MAX_LENGTH);
      expect(hasLink(text)).toBe(false);
      expect(hasBadWord(text)).toBe(false);
    }
  });
});

describe('peekText', () => {
  it('keeps a short message whole', () => {
    expect(peekText('one more?')).toBe('one more?');
  });

  it('cuts a long message by characters, not by code units', () => {
    const long = '🎲'.repeat(CHAT_PEEK_LENGTH + 5);
    expect(peekText(long)).toBe(`${'🎲'.repeat(CHAT_PEEK_LENGTH)}…`);
  });
});

describe('day lines', () => {
  // Local times, so the test passes in every time zone.
  const at = (day: number, hour: number) => new Date(2026, 10, day, hour).getTime();

  it('draws a line over the first message of each day, but not for today alone', () => {
    const rows = chatRows(
      [
        message('a', 'white', at(24, 22)),
        message('b', 'black', at(24, 23)),
        message('c', 'white', at(25, 9)),
        message('d', 'black', at(26, 9)),
      ],
      'white',
      at(26, 10),
    );
    expect(rows.map((row) => row.dayLine)).toEqual([true, false, true, true]);
    expect(chatRows([message('a', 'white', at(26, 9))], 'white', at(26, 10))[0]?.dayLine).toBe(
      false,
    );
  });

  it('names today, yesterday and an older day', () => {
    const now = at(26, 10);
    expect(dayLabel(at(26, 1), now, 'en')).toEqual({ kind: 'today' });
    expect(dayLabel(at(25, 23), now, 'en')).toEqual({ kind: 'yesterday' });
    const older = dayLabel(at(12, 9), now, 'en');
    expect(older.kind).toBe('date');
    expect(older.kind === 'date' ? older.text : '').toMatch(/12/);
  });
});

describe('peekMs', () => {
  it('gives a short message the base time and a long one more, up to the cap', () => {
    expect(peekMs('hi')).toBe(CHAT_PEEK_MS);
    expect(peekMs('x'.repeat(60))).toBe(2500 + 50 * 60);
    expect(peekMs('x'.repeat(200))).toBeLessThanOrEqual(CHAT_PEEK_MAX_MS);
    expect(peekMs('x'.repeat(200))).toBe(2500 + 50 * CHAT_PEEK_LENGTH);
  });
});

describe('nextPeek', () => {
  it('shows two peeks in a row, then only the count, then peeks again later', () => {
    const first = nextPeek([], 1000);
    expect(first).toEqual({ times: [1000], show: true });
    const second = nextPeek(first.times, 2000);
    expect(second.show).toBe(true);
    const third = nextPeek(second.times, 3000);
    expect(third).toEqual({ times: [1000, 2000], show: false });
    expect(nextPeek(third.times, 1000 + CHAT_PEEK_REPEAT_MS).show).toBe(true);
  });
});
