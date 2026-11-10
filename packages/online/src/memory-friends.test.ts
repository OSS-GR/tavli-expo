// Friends on the in-memory server (#406): the Friends contract, and what
// the contract leaves to each server (the caps, the search limit, the
// wait after a decline).

import { describe, expect, it } from 'vitest';

import {
  FRIEND_REQUEST_WAIT_MS,
  FRIEND_SEARCHES_PER_HOUR,
  FRIEND_SEARCH_WINDOW_MS,
  MAX_FRIENDS,
  MAX_INCOMING_FRIEND_REQUESTS,
  MAX_OPEN_FRIEND_REQUESTS,
} from '@tavli/contracts';
import { friendsContract } from '@tavli/contracts/testing';
import type { FriendsContractSubject } from '@tavli/contracts/testing';
import { createSeededRng } from '@tavli/engine';

import { createMemoryGameServer } from './memory-server';
import type { MemoryGameServer } from './memory-server';

const START = Date.UTC(2026, 10, 9, 12, 0, 0);

function setup() {
  let now = START;
  const server = createMemoryGameServer({ rng: createSeededRng(5), now: () => now });
  return {
    server,
    passTime: (ms: number) => {
      now += ms;
    },
  };
}

function contractSubject(): FriendsContractSubject {
  const { server } = setup();
  for (const player of ['alice', 'bob', 'carol']) server.markSaved(player);
  return {
    idOf: (player) => player,
    friendsFor: (player) => server.friendsFor(player),
    invitesFor: (player) => server.invitesFor(player),
    gamesFor: (player) => server.transportFor(player),
    safetyFor: (player) => server.safetyFor(player),
    usernamesFor: (player) => server.usernamesFor(player, player !== 'guest'),
    onlineDataFor: (player) => server.onlineDataFor(player),
    settle: () => Promise.resolve(),
  };
}

describe('Friends contract (in-memory server)', () => {
  for (const check of friendsContract()) {
    it(check.name, () => check.run(contractSubject()));
  }
});

/** `ids` saved players. */
function savedPlayers(server: MemoryGameServer, prefix: string, count: number): string[] {
  const ids = Array.from({ length: count }, (_, i) => `${prefix}${i}`);
  for (const id of ids) server.markSaved(id);
  return ids;
}

/** `from` asks `to` by `to`'s link. */
async function ask(server: MemoryGameServer, from: string, to: string) {
  const token = await server.friendsFor(to).myFriendLink();
  return await server.friendsFor(from).requestByLink(token);
}

describe('friends on the in-memory server', () => {
  it('caps open requests sent at MAX_OPEN_FRIEND_REQUESTS', async () => {
    const { server } = setup();
    server.markSaved('me');
    const others = savedPlayers(server, 'p', MAX_OPEN_FRIEND_REQUESTS + 1);
    for (const other of others.slice(0, -1)) await ask(server, 'me', other);
    await expect(ask(server, 'me', others.at(-1) ?? '')).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
    // A cancel frees a place.
    await server.friendsFor('me').cancelRequest('p0');
    await expect(ask(server, 'me', others.at(-1) ?? '')).resolves.toBe('sent');
  });

  it('a full inbox refuses new requests with TRY_LATER', async () => {
    const { server } = setup();
    server.markSaved('me');
    const others = savedPlayers(server, 'p', MAX_INCOMING_FRIEND_REQUESTS + 1);
    for (const other of others.slice(0, -1)) await ask(server, other, 'me');
    await expect(ask(server, others.at(-1) ?? '', 'me')).rejects.toMatchObject({
      code: 'TRY_LATER',
    });
    expect((await server.friendsFor('me').listRequests()).incoming).toHaveLength(
      MAX_INCOMING_FRIEND_REQUESTS,
    );
  });

  it('caps friends at MAX_FRIENDS, on both sides', async () => {
    const { server } = setup();
    server.markSaved('me');
    server.markSaved('late');
    const others = savedPlayers(server, 'p', MAX_FRIENDS);
    for (const other of others) {
      await ask(server, other, 'me');
      await server.friendsFor('me').acceptRequest(other);
    }
    expect(await server.friendsFor('me').listFriends()).toHaveLength(MAX_FRIENDS);
    // `me` cannot ask, and cannot be asked.
    await expect(ask(server, 'me', 'late')).rejects.toMatchObject({ code: 'TOO_MANY_FRIENDS' });
    await expect(ask(server, 'late', 'me')).rejects.toMatchObject({ code: 'TRY_LATER' });
    // A request sent before the cap cannot be accepted past it.
    await server.friendsFor('p0').removeFriend('me');
    await ask(server, 'late', 'me');
    await ask(server, 'p0', 'me');
    await server.friendsFor('me').acceptRequest('late');
    await expect(server.friendsFor('me').acceptRequest('p0')).rejects.toMatchObject({
      code: 'TOO_MANY_FRIENDS',
    });
  });

  it('limits username searches per hour, over a moving window', async () => {
    const { server, passTime } = setup();
    server.markSaved('me');
    const friends = server.friendsFor('me');
    for (let i = 0; i < FRIEND_SEARCHES_PER_HOUR - 1; i += 1) await friends.findPlayer(`n${i}`);
    // A request by username counts too.
    await expect(friends.requestByUsername('nobody')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(friends.findPlayer('one_more')).rejects.toMatchObject({
      code: 'TOO_MANY_SEARCHES',
    });
    passTime(FRIEND_SEARCH_WINDOW_MS);
    await expect(friends.findPlayer('one_more')).resolves.toBeNull();
  });

  it('a declined sender may ask again after FRIEND_REQUEST_WAIT_MS', async () => {
    const { server, passTime } = setup();
    server.markSaved('a');
    server.markSaved('b');
    await ask(server, 'a', 'b');
    await server.friendsFor('b').declineRequest('a');
    passTime(FRIEND_REQUEST_WAIT_MS - 1);
    await expect(ask(server, 'a', 'b')).rejects.toMatchObject({ code: 'TRY_LATER' });
    passTime(1);
    await expect(ask(server, 'a', 'b')).resolves.toBe('sent');
    expect((await server.friendsFor('b').listRequests()).incoming).toHaveLength(1);
  });
});
