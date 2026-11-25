// The dev chat (#692): a dev online game with `chat` gives both players a
// username on the in-memory server, and the bot answers each message.

import type { ChatView } from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import { createMemoryGameServer } from '@tavli/online';

import { botRunner } from '@/services';

import { DEV_BOT_ID, DEV_CHAT_REPLIES, DEV_CHAT_REPLY_MS, startDevGame } from './devGame';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

/** Lets the in-memory server's answers land. */
async function flush() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

function start(chat: boolean) {
  const server = createMemoryGameServer({ rng: createSeededRng(7), now: () => Date.now() });
  const game = startDevGame({
    server,
    me: 'me',
    choice: 'portes',
    turnTimeMinutes: null,
    targetPoints: 1,
    difficulty: 'easy',
    runner: botRunner,
    rng: createSeededRng(3),
    chat,
  });
  const views: ChatView[] = [];
  const stop = server.chatFor('me').watch(game.gameId, (view) => views.push(view));
  return { server, game, views, stop, last: () => views[views.length - 1] };
}

describe('the dev chat', () => {
  it('opens the chat for both players, and the bot answers each message', async () => {
    const { server, game, last, stop } = start(true);
    await flush();
    expect(last()?.status).toBe('open');
    expect(server.nameOf('me')).toEqual({ kind: 'username', name: 'You_dev' });
    expect(server.nameOf(DEV_BOT_ID)).toEqual({ kind: 'username', name: 'Dev_bot' });

    await server.chatFor('me').send({ gameId: game.gameId, text: 'hello' });
    await flush();
    expect(last()?.messages.map((m) => m.text)).toEqual(['hello']);
    jest.advanceTimersByTime(DEV_CHAT_REPLY_MS);
    await flush();
    expect(last()?.messages.map((m) => m.text)).toEqual(['hello', DEV_CHAT_REPLIES[0]]);

    // The bot answers your messages, never its own.
    jest.advanceTimersByTime(10 * DEV_CHAT_REPLY_MS);
    await flush();
    expect(last()?.messages).toHaveLength(2);
    stop();
    game.stop();
  });

  it('stops with the game: no answer comes later', async () => {
    const { server, game, last, stop } = start(true);
    await flush();
    await server.chatFor('me').send({ gameId: game.gameId, text: 'hello' });
    await flush();
    game.stop();
    jest.advanceTimersByTime(10 * DEV_CHAT_REPLY_MS);
    await flush();
    expect(last()?.messages.map((m) => m.text)).toEqual(['hello']);
    stop();
  });

  it('has no chat without the option: the players stay guests', async () => {
    const { server, game, views, stop } = start(false);
    await flush();
    expect(views.at(-1)?.status).toBe('needs-account');
    expect(server.nameOf('me')?.kind).toBe('guest');
    stop();
    game.stop();
  });
});
