/**
 * "Invites from friends" on Home (#486), on the Jest online fake: one
 * in-memory server, and `auth` / `friends` as the signed-in user.
 */
import type { Friends } from '@tavli/contracts';
import { act, render, screen } from '@testing-library/react-native';

import { auth } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { onlineFake } from '../../../test/onlineFake';

import { HomeFriendInvites } from './HomeFriendInvites';

runOnFakeTimers();

const ME = 'me';
const ANN = 'ann';

/** Lets the server answer (it answers on later microtasks). */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

function signInSaved(): void {
  onlineFake.authStore.session = { id: ME, isGuest: false };
  onlineFake.server().markSaved(ME);
}

/** Ann and I are friends (we met in a game, she asked, I accepted). */
async function befriendAnn(): Promise<void> {
  const server = onlineFake.server();
  server.markSaved(ANN);
  server.createGame(ME, { white: ME, black: ANN }, 'portes', 3, null);
  await server.friendsFor(ANN).sendRequest(ME);
  await server.friendsFor(ME).acceptRequest(ANN);
}

/** Ann invites me to a game; the invite's code. */
async function annInvites(points = 5): Promise<string> {
  return await onlineFake
    .server()
    .friendsFor(ANN)
    .inviteFriend(ME, { choice: 'plakoto', targetPoints: points, turnTimeMinutes: null });
}

async function show(friends: Friends = onlineFake.friends, focused = true) {
  const onOpen = jest.fn();
  const view = await render(
    <HomeFriendInvites auth={auth!} friends={friends} focused={focused} onOpen={onOpen} />,
  );
  await flush();
  const focus = async (next: boolean) => {
    await view.rerender(
      <HomeFriendInvites auth={auth!} friends={friends} focused={next} onOpen={onOpen} />,
    );
    await flush();
  };
  return { onOpen, focus };
}

const annName = () => `Guest ${onlineFake.guestNumber(ANN)}`;

describe('<HomeFriendInvites />', () => {
  it('lists the friend invites to me; a row reads as one item and a tap opens it', async () => {
    signInSaved();
    await befriendAnn();
    const code = await annInvites();
    const { onOpen } = await show();
    expect(screen.getByRole('header', { name: 'Invites from friends' })).toBeOnTheScreen();
    const row = screen.getByTestId(`home-friend-invite-${code}`);
    expect(row).toHaveAccessibleName(`${annName()} invites you, Plakoto, 5 points`);
    await setupUser().press(row);
    expect(onOpen).toHaveBeenCalledWith(code);
  });

  it('shows nothing with no invite', async () => {
    signInSaved();
    await show();
    expect(screen.queryByTestId('home-friend-invites')).toBeNull();
  });

  it('a guest gets nothing and asks the server nothing', async () => {
    onlineFake.authStore.session = { id: ME, isGuest: true };
    const list = jest.spyOn(onlineFake.friends, 'listFriendInvites');
    await show();
    expect(screen.queryByTestId('home-friend-invites')).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it('with nobody signed in shows nothing and makes no account', async () => {
    await show();
    expect(screen.queryByTestId('home-friend-invites')).toBeNull();
    expect(auth!.currentUser()).toBeNull();
  });

  it('loads again each time Home comes into view', async () => {
    signInSaved();
    await befriendAnn();
    const { focus } = await show();
    expect(screen.queryByTestId('home-friend-invites')).toBeNull();
    const code = await annInvites();
    await focus(false);
    await focus(true);
    expect(screen.getByTestId(`home-friend-invite-${code}`)).toBeOnTheScreen();
  });

  it('a failed load keeps the list it had', async () => {
    signInSaved();
    await befriendAnn();
    const code = await annInvites();
    const { focus } = await show();
    expect(screen.getByTestId(`home-friend-invite-${code}`)).toBeOnTheScreen();
    jest.spyOn(onlineFake.friends, 'listFriendInvites').mockRejectedValueOnce(new Error('offline'));
    await focus(false);
    await focus(true);
    expect(screen.getByTestId(`home-friend-invite-${code}`)).toBeOnTheScreen();
  });

  it('an answer that comes after Home went out of view is dropped', async () => {
    signInSaved();
    await befriendAnn();
    await annInvites();
    let answer: () => void = () => {};
    const real = onlineFake.friends.listFriendInvites.bind(onlineFake.friends);
    jest
      .spyOn(onlineFake.friends, 'listFriendInvites')
      .mockImplementationOnce(() => new Promise((resolve) => (answer = () => resolve(real()))));
    const { focus } = await show();
    await focus(false);
    await act(async () => answer());
    await flush();
    expect(screen.queryByTestId('home-friend-invites')).toBeNull();
  });
});
