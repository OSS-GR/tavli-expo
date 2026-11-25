// Chat on the in-memory server (ADR-0011, #692): the Chat contract, and
// what the contract leaves to each server (live
// views when a player becomes able to chat, the account delete, the
// guest move).

import { describe, expect, it } from 'vitest';

import type { ChatView } from '@tavli/contracts';
import { chatContract } from '@tavli/contracts/testing';
import type { ChatContractSubject } from '@tavli/contracts/testing';
import { createSeededRng } from '@tavli/engine';

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

  it("moves a guest's mute and switch into the account", async () => {
    const { server, play } = setup();
    await markNamed(server, 'bob');
    await markNamed(server, 'saved');
    const gameId = await play('bob', 'guest');
    await server.chatFor('guest').setMuted(gameId, true);
    await server.chatFor('guest').setEnabled(false);
    server.moveGuest('guest', 'saved');
    expect(await server.chatFor('saved').settings()).toEqual({ enabled: false });
    await server.chatFor('saved').setEnabled(true);
    const saved = watching(server, 'saved', gameId);
    await flush();
    expect(saved.last()?.status).toBe('muted');
  });
});
