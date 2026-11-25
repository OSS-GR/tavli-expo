import {
  CHAT_MAX_LENGTH,
  CHAT_MESSAGES_PER_MINUTE,
  CHAT_RATE_WINDOW_MS,
  CHAT_VIEW_MESSAGES,
  TERMS_VERSION,
} from '@tavli/contracts';
import { describe, expect, it } from 'vitest';

import {
  CHAT_KEEP_MS,
  NO_CHAT_PLAYER,
  chatBanned,
  chatExpired,
  chatSeenBy,
  chatStatus,
  cleanChatText,
  hasBadWord,
  hasLink,
  planChatMessage,
  type ChatPlayer,
  type StoredChatMessage,
} from './chat';

const READY: ChatPlayer = {
  saved: true,
  hasUsername: true,
  termsVersion: TERMS_VERSION,
  enabled: true,
};

const status = (
  me: Partial<ChatPlayer> = {},
  other: Partial<ChatPlayer> = {},
  rest: { muted?: boolean; blocksOther?: boolean } = {},
) =>
  chatStatus({
    me: { ...READY, ...me },
    other: { ...READY, ...other },
    muted: rest.muted ?? false,
    blocksOther: rest.blocksOther ?? false,
  });

describe('chatStatus', () => {
  it('is open when both players may chat', () => {
    expect(status()).toBe('open');
  });

  it('names the reason on the caller side, in the order the app fixes them', () => {
    expect(chatStatus({ me: NO_CHAT_PLAYER, other: READY, muted: false, blocksOther: false })).toBe(
      'needs-account',
    );
    expect(status({ hasUsername: false, termsVersion: null })).toBe('needs-username');
    expect(status({ termsVersion: '2020-01-01' })).toBe('needs-terms');
    expect(status({ termsVersion: null })).toBe('needs-terms');
    expect(status({ enabled: false })).toBe('turned-off');
  });

  it('never says why the other side has no chat', () => {
    expect(status({}, { saved: false })).toBe('unavailable');
    expect(status({}, { hasUsername: false })).toBe('unavailable');
    expect(status({}, { termsVersion: null })).toBe('unavailable');
    expect(status({}, { enabled: false })).toBe('unavailable');
    expect(status({}, {}, { blocksOther: true })).toBe('unavailable');
  });

  it("puts the caller's own reason before the other side's", () => {
    expect(status({ saved: false }, { saved: false })).toBe('needs-account');
    expect(status({ enabled: false }, {}, { blocksOther: true })).toBe('turned-off');
  });

  it('is unavailable once the match ended CHAT_KEEP_MS ago', () => {
    const base = { me: READY, other: READY, muted: false, blocksOther: false };
    expect(chatStatus({ ...base, expired: true })).toBe('unavailable');
    expect(chatStatus({ ...base, me: NO_CHAT_PLAYER, expired: true })).toBe('needs-account');
    expect(chatExpired(null, 10 * CHAT_KEEP_MS)).toBe(false);
    expect(chatExpired(1000, 1000 + CHAT_KEEP_MS - 1)).toBe(false);
    expect(chatExpired(1000, 1000 + CHAT_KEEP_MS)).toBe(true);
  });

  it('is banned for the banned player and unavailable for the other', () => {
    expect(status({ banned: true })).toBe('banned');
    expect(status({ banned: true, enabled: false })).toBe('banned');
    expect(status({ banned: true, termsVersion: null })).toBe('needs-terms');
    expect(status({}, { banned: true })).toBe('unavailable');
    expect(chatBanned(undefined, 5)).toBe(false);
    expect(chatBanned(null, 5)).toBe(true);
    expect(chatBanned(6, 5)).toBe(true);
    expect(chatBanned(5, 5)).toBe(false);
  });

  it('is muted only when the chat would be open', () => {
    expect(status({}, {}, { muted: true })).toBe('muted');
    expect(status({}, { enabled: false }, { muted: true })).toBe('unavailable');
    expect(status({ saved: false }, {}, { muted: true })).toBe('needs-account');
  });
});

describe('cleanChatText', () => {
  it('trims, joins lines and removes hidden characters', () => {
    expect(cleanChatText('  good \n\n game\t! ')).toBe('good game !');
    expect(cleanChatText('a​b\u0000c')).toBe('a b c');
    expect(cleanChatText(' \n ')).toBe('');
  });

  it('keeps the joiners, so a joined emoji stays one sign', () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    expect(cleanChatText(`hi ${family}`)).toBe(`hi ${family}`);
  });

  it('keeps one composed form', () => {
    expect(cleanChatText('é')).toBe('é');
  });
});

describe('hasLink', () => {
  it.each([
    'see https://example.com',
    'go to www.example.org now',
    'my site is tavli-fans.gr',
    'Example.COM',
    'mail me a@b.io',
    'me@home',
  ])('refuses %s', (text) => {
    expect(hasLink(text)).toBe(true);
  });

  it.each(['good game. one more?', 'nice roll... again', '6-5 again!', 'gg wp', 'I am 2.5 up'])(
    'allows %s',
    (text) => {
      expect(hasLink(text)).toBe(false);
    },
  );
});

describe('hasBadWord', () => {
  it.each(['you faggot', 'FAGG0T', 'f_a_g_g_o_t', 'πούστη', 'ΠΟΥΣΤΗ', 'pousti re', 'a fag'])(
    'refuses the slur in %s',
    (text) => {
      expect(hasBadWord(text)).toBe(true);
    },
  );

  it.each(['oh shit', 'fuck, nice roll', 'μαλάκα τι ζάρι', 'malaka re', 'γαμώτο'])(
    'allows ordinary swearing: %s',
    (text) => {
      expect(hasBadWord(text)).toBe(false);
    },
  );

  it.each([
    'push it',
    'nice hit',
    'good luck, admin',
    'that was a classic',
    'a cocktail after the game',
    'καλή επιτυχία',
    'a raccoon and a spice rack',
    'do not niggle',
  ])('allows %s', (text) => {
    expect(hasBadWord(text)).toBe(false);
  });
});

describe('planChatMessage', () => {
  const plan = (text: string, sentTimes: readonly number[] = [], now = 1_000_000) =>
    planChatMessage({ text, status: 'open', sentTimes, now });

  it('keeps the clean text', () => {
    expect(plan('  good\ngame ')).toEqual({ ok: true, text: 'good game' });
  });

  it('refuses a send while the chat is not open', () => {
    for (const closed of ['muted', 'turned-off', 'unavailable', 'needs-account'] as const) {
      const result = planChatMessage({ text: 'hi', status: closed, sentTimes: [], now: 0 });
      expect(result).toMatchObject({ ok: false, code: 'CHAT_CLOSED' });
    }
  });

  it('refuses an empty text', () => {
    expect(plan(' \n ')).toMatchObject({ ok: false, code: 'EMPTY' });
    expect(plan(undefined as unknown as string)).toMatchObject({ ok: false, code: 'EMPTY' });
  });

  it('counts characters, not code units, for the length', () => {
    expect(plan('α'.repeat(CHAT_MAX_LENGTH))).toMatchObject({ ok: true });
    expect(plan('🎲'.repeat(CHAT_MAX_LENGTH))).toMatchObject({ ok: true });
    expect(plan('a'.repeat(CHAT_MAX_LENGTH + 1))).toMatchObject({ ok: false, code: 'TOO_LONG' });
  });

  it('refuses a link and a blocked word', () => {
    expect(plan('visit www.example.com')).toMatchObject({ ok: false, code: 'LINK' });
    expect(plan('you faggot')).toMatchObject({ ok: false, code: 'BAD_WORDS' });
  });

  it('allows the last message of the minute and refuses the next', () => {
    const now = 10 * CHAT_RATE_WINDOW_MS;
    const recent = (count: number) => Array.from({ length: count }, (_, i) => now - 1 - i);
    expect(plan('hi', recent(CHAT_MESSAGES_PER_MINUTE - 1), now)).toMatchObject({ ok: true });
    expect(plan('hi', recent(CHAT_MESSAGES_PER_MINUTE), now)).toMatchObject({
      ok: false,
      code: 'TOO_FAST',
    });
  });

  it('forgets messages older than the window, with no cap per game', () => {
    const now = 10 * CHAT_RATE_WINDOW_MS;
    const old = Array.from({ length: 5000 }, () => now - CHAT_RATE_WINDOW_MS);
    expect(plan('hi', old, now)).toMatchObject({ ok: true });
  });
});

describe('chatSeenBy', () => {
  const stored: StoredChatMessage[] = [
    { id: '2', from: 'black', text: 'you too', sentAt: 20, hidden: false },
    { id: '1', from: 'white', text: 'good luck', sentAt: 10, hidden: false },
    { id: '3', from: 'black', text: 'after the block', sentAt: 30, hidden: true },
  ];

  it('shows the messages oldest first, with no hidden flag', () => {
    expect(chatSeenBy(stored, 'white', 'open')).toEqual([
      { id: '1', from: 'white', text: 'good luck', sentAt: 10 },
      { id: '2', from: 'black', text: 'you too', sentAt: 20 },
    ]);
  });

  it('shows a hidden message only to its sender', () => {
    expect(chatSeenBy(stored, 'black', 'open').map((m) => m.id)).toEqual(['1', '2', '3']);
  });

  it('shows only the newest CHAT_VIEW_MESSAGES', () => {
    const many: StoredChatMessage[] = Array.from({ length: CHAT_VIEW_MESSAGES + 5 }, (_, i) => ({
      id: String(i),
      from: 'white',
      text: `message ${i}`,
      sentAt: i,
      hidden: false,
    }));
    const seen = chatSeenBy(many, 'black', 'open');
    expect(seen).toHaveLength(CHAT_VIEW_MESSAGES);
    expect(seen[0]?.id).toBe('5');
    expect(seen[seen.length - 1]?.id).toBe(String(CHAT_VIEW_MESSAGES + 4));
  });

  it('shows nothing while the chat is not open for the viewer', () => {
    for (const closed of ['muted', 'turned-off', 'unavailable', 'needs-terms'] as const) {
      expect(chatSeenBy(stored, 'white', closed)).toEqual([]);
    }
  });
});
