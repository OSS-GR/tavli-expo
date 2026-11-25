// Chat on the in-memory server (ADR-0011, #692): the Chat contract, and
// what the contract leaves to each server (live
// views when a player becomes able to chat, the account delete, the
// guest move).

import { describe, expect, it } from 'vitest';

import { CHAT_RATE_WINDOW_MS, REPORT_CHAT_MESSAGES } from '@tavli/contracts';
import type { ChatView } from '@tavli/contracts';
import { chatContract } from '@tavli/contracts/testing';
import type { ChatContractSubject } from '@tavli/contracts/testing';
import { createSeededRng } from '@tavli/engine';

import { CHAT_KEEP_MS } from './chat';
import { createMemoryGameServer } from './memory-server';
import { markNamed } from './testing';

const START = Date.UTC(2026, 10, 25, 12, 0, 0);
const GAME = { choice: 'portes', targetPoints: 3, turnTimeMinutes: null } as const;

/** Lets the server's microtasks run. */
async function flush() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

function setup() {
  let now = START;
  const server = createMemoryGameServer({ rng: createSeededRng(5), now: () => now });
  const play = async (from: string, to: string) => {
    const code = await server.invitesFor(from).createInvite(GAME);
    return await server.invitesFor(to).acceptInvite(code);
  };
  return {
    server,
    play,
    passTime: (ms: number) => {
      now += ms;
    },
  };
}

async function contractSubject(): Promise<ChatContractSubject> {
  const { server, play, passTime } = setup();
  for (const player of ['alice', 'bob', 'carol']) await markNamed(server, player);
  return {
    chatFor: (player) => server.chatFor(player),
    safetyFor: (player) => server.safetyFor(player),
    idOf: (player) => player,
    gameId: await play('alice', 'bob'),
    guestGameId: await play('alice', 'gil'),
    advance: (ms) => {
      passTime(ms);
      return Promise.resolve();
    },
    settle: flush,
  };
}

describe('Chat contract (in-memory server)', () => {
  for (const check of chatContract()) {
    it(check.name, async () => check.run(await contractSubject()));
  }
});

describe('chat on the in-memory server', () => {
  async function ready() {
    const made = setup();
    await markNamed(made.server, 'alice');
    await markNamed(made.server, 'bob');
    return { ...made, gameId: await made.play('alice', 'bob') };
  }

  function watching(server: ReturnType<typeof setup>['server'], player: string, gameId: string) {
    const views: ChatView[] = [];
    const stop = server.chatFor(player).watch(gameId, (view) => views.push(view));
    return { views, stop, last: () => views[views.length - 1] };
  }

  it('rejects an unknown game', async () => {
    const { server } = await ready();
    await expect(server.chatFor('alice').send({ gameId: 'none', text: 'hi' })).rejects.toEqual({
      code: 'GAME_NOT_FOUND',
      message: expect.any(String) as string,
    });
  });

  it('opens the chat live when the guest saves the account and picks a username', async () => {
    const { server, play } = setup();
    await markNamed(server, 'alice');
    const gameId = await play('alice', 'gil');
    const alice = watching(server, 'alice', gameId);
    const gil = watching(server, 'gil', gameId);
    await flush();
    expect(alice.last()?.status).toBe('unavailable');
    expect(gil.last()?.status).toBe('needs-account');
    server.markSaved('gil');
    await flush();
    expect(gil.last()?.status).toBe('needs-username');
    await markNamed(server, 'gil');
    await flush();
    expect(gil.last()?.status).toBe('open');
    expect(alice.last()?.status).toBe('open');
  });

  it("deletes a player's messages, mutes and switch with the account", async () => {
    const { server, gameId } = await ready();
    await server.chatFor('alice').send({ gameId, text: 'from alice' });
    await server.chatFor('bob').send({ gameId, text: 'from bob' });
    await server.chatFor('alice').setEnabled(false);
    const bob = watching(server, 'bob', gameId);
    await server.onlineDataFor('alice').deleteMyData();
    await flush();
    // The other account is gone, so the chat is closed for Bob.
    expect(bob.last()).toEqual({ gameId, status: 'unavailable', messages: [] });
    await expect(server.chatFor('alice').settings()).rejects.toMatchObject({
      code: 'NOT_SIGNED_IN',
    });
  });

  it("moves a guest's mute into the account; the account keeps its own switch", async () => {
    const { server, play } = setup();
    await markNamed(server, 'bob');
    await markNamed(server, 'saved');
    const gameId = await play('bob', 'guest');
    await server.chatFor('guest').setMuted(gameId, true);
    await server.chatFor('guest').setEnabled(false);
    server.moveGuest('guest', 'saved');
    expect(await server.chatFor('saved').settings()).toEqual({ enabled: true });
    const saved = watching(server, 'saved', gameId);
    await flush();
    expect(saved.last()?.status).toBe('muted');
  });

  it("puts only the caller's own messages and switch in Download my data", async () => {
    const { server, gameId, passTime } = await ready();
    await server.chatFor('alice').send({ gameId, text: 'first' });
    passTime(1000);
    await server.chatFor('bob').send({ gameId, text: 'from bob' });
    passTime(1000);
    await server.chatFor('alice').send({ gameId, text: 'second' });
    await server.chatFor('alice').setEnabled(false);
    const copy = await server.onlineDataFor('alice').exportMyData();
    expect(copy.chat).toEqual({
      enabled: false,
      ban: null,
      messages: [
        { gameId, text: 'second', sentAt: START + 2000 },
        { gameId, text: 'first', sentAt: START },
      ],
    });
    expect(JSON.stringify(copy)).not.toContain('from bob');
  });

  it('a report from the chat keeps the last messages of the reported player only', async () => {
    const { server, gameId, passTime } = await ready();
    for (let i = 0; i < REPORT_CHAT_MESSAGES + 2; i += 1) {
      passTime(CHAT_RATE_WINDOW_MS);
      await server.chatFor('bob').send({ gameId, text: `rude ${i}` });
    }
    await server.chatFor('alice').send({ gameId, text: 'please stop' });
    await server.safetyFor('alice').report({ playerId: 'bob', reason: 'chat', gameId });
    const [report] = server.reportsOf();
    expect(report?.reason).toBe('chat');
    expect(report?.chat).toHaveLength(REPORT_CHAT_MESSAGES);
    expect(report?.chat?.[0]?.text).toBe('rude 2');
    expect(report?.chat?.at(-1)?.text).toBe(`rude ${REPORT_CHAT_MESSAGES + 1}`);
    expect(JSON.stringify(report)).not.toContain('please stop');
    // A report blocks too: the chat is closed for the reporter.
    const alice = watching(server, 'alice', gameId);
    await flush();
    expect(alice.last()?.status).toBe('unavailable');
  });

  it('a second report gives the kept report its messages, and adds no row', async () => {
    const { server, gameId } = await ready();
    await server.chatFor('bob').send({ gameId, text: 'rude' });
    await server.safetyFor('alice').report({ playerId: 'bob', reason: 'name' });
    expect(server.reportsOf()[0]?.chat).toBeUndefined();
    await server.safetyFor('alice').report({ playerId: 'bob', reason: 'chat', gameId });
    expect(server.reportsOf()).toHaveLength(1);
    expect(server.reportsOf()[0]).toMatchObject({ reason: 'name', chat: [{ text: 'rude' }] });
  });

  it("ignores a report's game that is not between the two players", async () => {
    const { server, gameId, play } = await ready();
    await markNamed(server, 'carol');
    const other = await play('bob', 'carol');
    await server.chatFor('bob').send({ gameId: other, text: 'to carol' });
    await server.safetyFor('alice').report({ playerId: 'bob', reason: 'chat', gameId: other });
    expect(server.reportsOf()[0]?.chat).toBeUndefined();
    expect(gameId).not.toBe(other);
  });

  it('a ban closes the chat for the banned player until it ends', async () => {
    const { server, gameId, passTime } = await ready();
    const alice = watching(server, 'alice', gameId);
    const bob = watching(server, 'bob', gameId);
    server.banChat('bob', START + 1000);
    await flush();
    expect(bob.last()?.status).toBe('banned');
    expect(alice.last()?.status).toBe('unavailable');
    await expect(server.chatFor('bob').send({ gameId, text: 'hi' })).rejects.toMatchObject({
      code: 'CHAT_CLOSED',
    });
    expect((await server.onlineDataFor('bob').exportMyData()).chat.ban).toEqual({
      until: START + 1000,
    });
    passTime(1000);
    await expect(server.chatFor('bob').send({ gameId, text: 'hi' })).resolves.toMatchObject({
      text: 'hi',
    });
    server.banChat('bob', null);
    await flush();
    expect(bob.last()?.status).toBe('banned');
    server.unbanChat('bob');
    await flush();
    expect(bob.last()?.status).toBe('open');
  });

  it("the owner deletes a player's messages", async () => {
    const { server, gameId } = await ready();
    await server.chatFor('bob').send({ gameId, text: 'rude' });
    await server.chatFor('alice').send({ gameId, text: 'fine' });
    const alice = watching(server, 'alice', gameId);
    server.deleteChatOf('bob');
    await flush();
    expect(alice.last()?.messages.map((message) => message.text)).toEqual(['fine']);
  });

  it('closes and deletes the chat CHAT_KEEP_MS after the match ends', async () => {
    const { server, gameId, passTime } = await ready();
    await server.chatFor('alice').send({ gameId, text: 'good game' });
    await server.chatFor('bob').setMuted(gameId, true);
    await server.transportFor('alice').resign(gameId);
    const alice = watching(server, 'alice', gameId);
    passTime(CHAT_KEEP_MS - 1);
    server.runDueTimeouts();
    await flush();
    expect(alice.last()?.messages).toHaveLength(1);
    passTime(1);
    server.runDueTimeouts();
    await flush();
    expect(alice.last()).toEqual({ gameId, status: 'unavailable', messages: [] });
    await expect(server.chatFor('alice').send({ gameId, text: 'hello?' })).rejects.toMatchObject({
      code: 'CHAT_CLOSED',
    });
    const copy = await server.onlineDataFor('alice').exportMyData();
    expect(copy.chat.messages).toEqual([]);
  });
});
