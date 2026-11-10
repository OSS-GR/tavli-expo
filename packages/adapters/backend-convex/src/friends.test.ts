// The friends adapter on a fake Convex client: the names, the arguments,
// and how errors map to the port. The contract checks against the real
// Convex functions run in `apps/server` (`convex/convexFriends.test.ts`).

import { ConvexError } from 'convex/values';
import { getFunctionName } from 'convex/server';
import { describe, expect, it } from 'vitest';

import { createConvexFriends } from './friends';
import type { ConvexFriendsClient } from './friends';
import { FRIEND_FUNCTIONS, FRIEND_FUNCTION_NAMES } from './functions';

function fakeClient(answer: () => Promise<unknown> = () => Promise.resolve(null)) {
  const calls: { kind: string; name: string; args: unknown }[] = [];
  const client: ConvexFriendsClient = {
    query: (fn, args) => {
      calls.push({ kind: 'query', name: getFunctionName(fn), args });
      return answer() as never;
    },
    mutation: (fn, args) => {
      calls.push({ kind: 'mutation', name: getFunctionName(fn), args });
      return answer() as never;
    },
  };
  return { client, calls };
}

const GAME = { choice: 'portes', targetPoints: 3, turnTimeMinutes: null } as const;

describe('createConvexFriends', () => {
  it('names every function in friends.ts', () => {
    for (const [key, name] of Object.entries(FRIEND_FUNCTION_NAMES)) {
      expect(name).toBe(`friends:${key}`);
      expect(getFunctionName(FRIEND_FUNCTIONS[key as keyof typeof FRIEND_FUNCTIONS])).toBe(name);
    }
  });

  it('sends only the other player, the token, the name or the game, never the caller', async () => {
    const { client, calls } = fakeClient();
    const friends = createConvexFriends({ client });
    await friends.listFriends();
    await friends.listRequests();
    await friends.recentPlayers();
    await friends.findPlayer('alice');
    await friends.myFriendLink();
    await friends.resetFriendLink();
    await friends.openFriendLink('TOKEN');
    await friends.requestByLink('TOKEN');
    await friends.sendRequest('p2');
    await expect(friends.acceptRequest('p2')).resolves.toBeUndefined();
    await expect(friends.declineRequest('p2')).resolves.toBeUndefined();
    await expect(friends.cancelRequest('p2')).resolves.toBeUndefined();
    await expect(friends.removeFriend('p2')).resolves.toBeUndefined();
    await friends.inviteFriend('p2', GAME);
    await friends.listFriendInvites();
    expect(calls).toEqual([
      { kind: 'query', name: 'friends:listFriends', args: {} },
      { kind: 'query', name: 'friends:listFriendRequests', args: {} },
      { kind: 'query', name: 'friends:recentPlayers', args: {} },
      { kind: 'mutation', name: 'friends:findPlayer', args: { username: 'alice' } },
      { kind: 'mutation', name: 'friends:myFriendLink', args: {} },
      { kind: 'mutation', name: 'friends:resetFriendLink', args: {} },
      { kind: 'query', name: 'friends:openFriendLink', args: { token: 'TOKEN' } },
      { kind: 'mutation', name: 'friends:requestByLink', args: { token: 'TOKEN' } },
      { kind: 'mutation', name: 'friends:sendFriendRequest', args: { playerId: 'p2' } },
      { kind: 'mutation', name: 'friends:acceptFriendRequest', args: { playerId: 'p2' } },
      { kind: 'mutation', name: 'friends:declineFriendRequest', args: { playerId: 'p2' } },
      { kind: 'mutation', name: 'friends:cancelFriendRequest', args: { playerId: 'p2' } },
      { kind: 'mutation', name: 'friends:removeFriend', args: { playerId: 'p2' } },
      { kind: 'mutation', name: 'friends:inviteFriend', args: { playerId: 'p2', ...GAME } },
      { kind: 'query', name: 'friends:listFriendInvites', args: {} },
    ]);
  });

  it('turns a failed request by username (a value) into a rejection', async () => {
    const failed = { ok: false, code: 'NOT_FOUND', message: 'no such player' };
    const { client } = fakeClient(() => Promise.resolve(failed));
    await expect(createConvexFriends({ client }).requestByUsername('x')).rejects.toEqual({
      code: 'NOT_FOUND',
      message: 'no such player',
    });
    const sent = fakeClient(() => Promise.resolve({ ok: true, status: 'sent' }));
    await expect(createConvexFriends({ client: sent.client }).requestByUsername('x')).resolves.toBe(
      'sent',
    );
  });

  it('rejects with the server error data, as a plain object', async () => {
    const data = { code: 'NOT_SAVED', message: 'save your account to add friends' };
    const { client } = fakeClient(() => Promise.reject(new ConvexError(data)));
    const reason = await createConvexFriends({ client })
      .listFriends()
      .then(
        () => 'resolved',
        (error: unknown) => error,
      );
    expect(reason).toEqual(data);
    expect(reason).not.toBeInstanceOf(Error);
  });

  it('keeps any other error as it is', async () => {
    const network = new Error('offline');
    const { client } = fakeClient(() => Promise.reject(network));
    await expect(createConvexFriends({ client }).recentPlayers()).rejects.toBe(network);
  });
});
