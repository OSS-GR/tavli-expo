/**
 * "Invites from friends" on Home (#486), on the Jest online fake: one
 * in-memory server, and `auth` / `friends` as the signed-in user.
 */
import type { AuthProvider, Friends } from '@tavli/contracts';
import { act, render, screen } from '@testing-library/react-native';

import { auth } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { markNamed } from '@tavli/online/testing';

import { onlineFake } from '../../../test/onlineFake';

import { HomeFriendInvites, useFriendInvites } from './HomeFriendInvites';

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
  // Friends need a username (#599).
  await markNamed(server, ME);
  await markNamed(server, ANN);
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

interface ShownProps {
  auth: AuthProvider;
  friends: Friends;
  focused: boolean;
  onOpen: (code: string) => void;
}

/** The list as Home shows it, loaded as the route does. */
function Shown({ auth: signIn, friends: list, focused, onOpen }: ShownProps) {
  const invites = useFriendInvites(signIn, list, focused);
  return <HomeFriendInvites invites={invites} onOpen={onOpen} />;
}

async function show(friends: Friends = onlineFake.friends, focused = true) {
  const onOpen = jest.fn();
  const view = await render(
    <Shown auth={auth!} friends={friends} focused={focused} onOpen={onOpen} />,
  );
  await flush();
  const focus = async (next: boolean) => {
    await view.rerender(<Shown auth={auth!} friends={friends} focused={next} onOpen={onOpen} />);
    await flush();
  };
  return { onOpen, focus };
}

const annName = () => `U_${ANN}`;

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

  it('a sign-out clears the list at once', async () => {
    signInSaved();
    await befriendAnn();
    const code = await annInvites();
    await show();
    expect(screen.getByTestId(`home-friend-invite-${code}`)).toBeOnTheScreen();
    await act(async () => auth!.signOut());
    await flush();
    expect(screen.queryByTestId('home-friend-invites')).toBeNull();
  });

  it('turned off, it forgets the list', async () => {
    signInSaved();
    await befriendAnn();
    const code = await annInvites();
    const onOpen = jest.fn();
    const view = await render(
      <Off auth={auth!} friends={onlineFake.friends} on={true} onOpen={onOpen} />,
    );
    await flush();
    expect(screen.getByTestId(`home-friend-invite-${code}`)).toBeOnTheScreen();
    await view.rerender(
      <Off auth={auth!} friends={onlineFake.friends} on={false} onOpen={onOpen} />,
    );
    expect(screen.queryByTestId('home-friend-invites')).toBeNull();
  });
});

/** The list with its `auth` taken away when `on` turns off (a sign-out on Home). */
function Off({
  auth: signIn,
  friends: list,
  on,
  onOpen,
}: {
  auth: AuthProvider;
  friends: Friends;
  on: boolean;
  onOpen: (code: string) => void;
}) {
  const invites = useFriendInvites(on ? signIn : undefined, list, true);
  return <HomeFriendInvites invites={invites} onOpen={onOpen} />;
}
