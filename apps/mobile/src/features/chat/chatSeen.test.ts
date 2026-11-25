import { createMemoryStorage, type ChatView } from '@tavli/contracts';

import { CHAT_SEEN_STORAGE_KEY, createChatSeen, newestSentAt, unreadCount } from './chatSeen';

const view = (messages: ChatView['messages']): ChatView => ({
  gameId: 'g1',
  status: 'open',
  messages,
});

describe('chatSeen', () => {
  it('keeps the newest read time per game, and never goes back', () => {
    const storage = createMemoryStorage();
    const seen = createChatSeen(storage);
    expect(seen.seenAt('g1')).toBe(0);
    seen.markSeen('g1', 50);
    seen.markSeen('g1', 20);
    seen.markSeen('g2', 5);
    expect(seen.seenAt('g1')).toBe(50);
    // A second instance reads the same storage (an app restart).
    expect(createChatSeen(storage).seenAt('g2')).toBe(5);
  });

  it('keeps only the games read last', () => {
    const storage = createMemoryStorage();
    const seen = createChatSeen(storage);
    for (let i = 0; i < 45; i += 1) seen.markSeen(`g${i}`, i + 1);
    expect(seen.seenAt('g0')).toBe(0);
    expect(seen.seenAt('g44')).toBe(45);
    expect(Object.keys(JSON.parse(storage.getString(CHAT_SEEN_STORAGE_KEY) ?? '{}'))).toHaveLength(
      40,
    );
  });

  it('reads a broken saved value as nothing', () => {
    const storage = createMemoryStorage();
    storage.setString(CHAT_SEEN_STORAGE_KEY, '[1,2');
    expect(createChatSeen(storage).seenAt('g1')).toBe(0);
    storage.setString(CHAT_SEEN_STORAGE_KEY, '{"g1":"soon","g2":7}');
    expect(createChatSeen(storage).seenAt('g1')).toBe(0);
    expect(createChatSeen(storage).seenAt('g2')).toBe(7);
  });

  it('shows the chat rules once', () => {
    const seen = createChatSeen(createMemoryStorage());
    expect(seen.rulesSeen()).toBe(false);
    seen.markRulesSeen();
    expect(seen.rulesSeen()).toBe(true);
  });
});

describe('unreadCount', () => {
  const messages = [
    { id: '1', from: 'white', text: 'hi', sentAt: 10 },
    { id: '2', from: 'black', text: 'hello', sentAt: 20 },
    { id: '3', from: 'black', text: 'you there?', sentAt: 30 },
  ] as const;

  it("counts the other player's messages newer than the read time", () => {
    expect(unreadCount(view(messages), 'white', 0)).toBe(2);
    expect(unreadCount(view(messages), 'white', 20)).toBe(1);
    expect(unreadCount(view(messages), 'white', 30)).toBe(0);
    // Your own messages are never unread.
    expect(unreadCount(view(messages), 'black', 0)).toBe(1);
    expect(unreadCount(null, 'white', 0)).toBe(0);
  });

  it('finds the newest time', () => {
    expect(newestSentAt(view(messages))).toBe(30);
    expect(newestSentAt(view([]))).toBe(0);
  });
});
