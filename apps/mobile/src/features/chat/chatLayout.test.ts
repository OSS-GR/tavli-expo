import { CHAT_MAX_LENGTH, type ChatMessage } from '@tavli/contracts';
import { hasBadWord, hasLink } from '@tavli/online';

import el from '@/i18n/el.json';
import en from '@/i18n/en.json';

import { CHAT_GROUP_GAP_MS, CHAT_PHRASES, CHAT_TIME_QUIET_MS, chatRows } from './chatLayout';

const message = (id: string, from: 'white' | 'black', sentAt: number): ChatMessage => ({
  id,
  from,
  text: id,
  sentAt,
});

describe('chatRows', () => {
  it('ends a group when the other player writes', () => {
    const rows = chatRows(
      [message('a', 'white', 0), message('b', 'white', 1000), message('c', 'black', 2000)],
      'white',
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
    );
    expect(rows.map((row) => row.last)).toEqual([true, true]);
  });

  it('keeps a group over a wait of exactly the gap', () => {
    const rows = chatRows(
      [message('a', 'white', 0), message('b', 'white', CHAT_GROUP_GAP_MS)],
      'black',
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
    );
    expect(rows.map((row) => row.time)).toEqual([false, true, true]);
  });

  it('gives no rows for no messages', () => {
    expect(chatRows([], 'white')).toEqual([]);
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
