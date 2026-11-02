/**
 * Delete my online data (#315), on the Jest online fake: one in-memory
 * server, `auth` and `onlineData` as the signed-in user, and the turn
 * notifications on the fake phone and push tokens.
 */
import { createMemoryStorage } from '@tavli/contracts';

import { createTurnPushes, TURN_PUSHES_STORAGE_KEY } from '@/features/notifications/turnPushes';
import { auth, onlineData } from '@/services';

import { runOnFakeTimers } from '../../../test/clock';
import { onlineFake } from '../../../test/onlineFake';

import { signInForOnline } from './account';
import { hasOnlineAccount } from './accountHint';
import { DELETE_TIME_LIMIT_MS, DeleteTimedOut, deleteOnlineData } from './deleteData';

runOnFakeTimers();

const GAME = { choice: 'portes', targetPoints: 3, turnTimeMinutes: null } as const;
const FRIEND = 'bob';

/** Turn notifications that the player turned on, with the token on the server. */
async function pushesOn() {
  const storage = createMemoryStorage();
  storage.setString(TURN_PUSHES_STORAGE_KEY, JSON.stringify({ declined: false, turnedOn: true }));
  const pushes = createTurnPushes({
    storage,
    notifications: onlineFake.notifications,
    pushTokens: onlineFake.pushTokens,
    auth: auth!,
  });
  onlineFake.notifications.setPermission('granted');
  await pushes.sync();
  return pushes;
}

/** The phone signed in for online play, with a match against the friend and an open invite. */
async function playedOnline() {
  const me = await signInForOnline(auth!);
  const pushes = await pushesOn();
  expect(onlineFake.pushTokens.saved).toHaveLength(1);
  const matchCode = await onlineFake.invites.createInvite(GAME);
  const gameId = await onlineFake.invitesFor(FRIEND).acceptInvite(matchCode);
  const openCode = await onlineFake.invites.createInvite(GAME);
  return { me, pushes, gameId, openCode };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('deleteOnlineData', () => {
  it('removes the push token, deletes the data, signs out and forgets the account note', async () => {
    const { me, pushes, gameId, openCode } = await playedOnline();
    const order: string[] = [];
    const remove = onlineFake.pushTokens.remove.bind(onlineFake.pushTokens);
    jest.spyOn(onlineFake.pushTokens, 'remove').mockImplementation((token) => {
      order.push('token');
      return remove(token);
    });
    const del = onlineData!.deleteMyData.bind(onlineData);
    jest.spyOn(onlineData!, 'deleteMyData').mockImplementation(() => {
      order.push('delete');
      return del();
    });
    const signOut = auth!.signOut.bind(auth);
    jest.spyOn(auth!, 'signOut').mockImplementation(() => {
      order.push('signOut');
      return signOut();
    });

    await deleteOnlineData({ auth: auth!, data: onlineData!, pushes });

    expect(order).toEqual(['token', 'delete', 'signOut']);
    expect(onlineFake.pushTokens.saved).toEqual([]);
    expect(auth!.currentUser()).toBeNull();
    expect(hasOnlineAccount()).toBe(false);
    // On the server: the match is resigned (the friend wins), the invite is gone.
    const server = onlineFake.server();
    expect(server.getInvite(openCode)).toBeNull();
    const friendGames = await onlineFake.transportFor(FRIEND).listMyGames({ status: 'finished' });
    expect(friendGames).toEqual([expect.objectContaining({ gameId })]);
    expect(friendGames[0]?.winner).toBe(friendGames[0]?.mySide);
    // The next Play a friend makes a new guest.
    const next = await signInForOnline(auth!);
    expect(next.id).not.toBe(me.id);
    expect(next).toEqual({ id: 'guest-2', isGuest: true });
  });

  it('works with no turn notifications in the build', async () => {
    await signInForOnline(auth!);
    await deleteOnlineData({ auth: auth!, data: onlineData!, pushes: undefined });
    expect(auth!.currentUser()).toBeNull();
    expect(hasOnlineAccount()).toBe(false);
  });

  it('counts NOT_SIGNED_IN as done: the data was gone already', async () => {
    await signInForOnline(auth!);
    // An earlier call that reached the server, with no answer on the phone.
    await onlineData!.deleteMyData();
    expect(auth!.currentUser()).not.toBeNull();
    await deleteOnlineData({ auth: auth!, data: onlineData!, pushes: undefined });
    expect(auth!.currentUser()).toBeNull();
    expect(hasOnlineAccount()).toBe(false);
  });

  it('on a failed call it stays signed in and keeps the note; a retry works', async () => {
    const { pushes, openCode } = await playedOnline();
    jest.spyOn(onlineData!, 'deleteMyData').mockRejectedValueOnce(new Error('offline'));
    await expect(deleteOnlineData({ auth: auth!, data: onlineData!, pushes })).rejects.toThrow(
      'offline',
    );
    expect(auth!.currentUser()).not.toBeNull();
    expect(hasOnlineAccount()).toBe(true);
    expect(onlineFake.server().getInvite(openCode)).not.toBeNull();

    await deleteOnlineData({ auth: auth!, data: onlineData!, pushes });
    expect(auth!.currentUser()).toBeNull();
    expect(hasOnlineAccount()).toBe(false);
    expect(onlineFake.server().getInvite(openCode)).toBeNull();
  });

  it('gives up after the time limit when the server does not answer (no network)', async () => {
    await signInForOnline(auth!);
    jest.spyOn(onlineData!, 'deleteMyData').mockReturnValueOnce(new Promise(() => {}));
    const run = deleteOnlineData({ auth: auth!, data: onlineData!, pushes: undefined });
    const failed = expect(run).rejects.toBeInstanceOf(DeleteTimedOut);
    await jest.advanceTimersByTimeAsync(DELETE_TIME_LIMIT_MS - 1);
    expect(auth!.currentUser()).not.toBeNull();
    await jest.advanceTimersByTimeAsync(1);
    await failed;
    expect(auth!.currentUser()).not.toBeNull();
    expect(hasOnlineAccount()).toBe(true);
  });

  it('after it, the old games list is gone: nobody is signed in', async () => {
    await playedOnline();
    await deleteOnlineData({ auth: auth!, data: onlineData!, pushes: undefined });
    await expect(onlineFake.games.listMyGames({ status: 'active' })).rejects.toMatchObject({
      code: 'NOT_SIGNED_IN',
    });
  });
});
