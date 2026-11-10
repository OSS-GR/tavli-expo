/**
 * Friends (#406), on the Jest online fake: the list, requests both ways,
 * Remove, Invite, Report or block, and friend invites to you.
 */
import type { Friends } from '@tavli/contracts';
import { act, render, screen } from '@testing-library/react-native';

import { auth } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { onlineFake } from '../../../test/onlineFake';

import { FriendsScreen } from './FriendsScreen';

runOnFakeTimers();

const ME = 'me';

/** Lets the server answer (it answers on later microtasks). */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

/** Signs me in with a saved account. */
function signInSaved(): void {
  onlineFake.authStore.session = { id: ME, isGuest: false };
  onlineFake.server().markSaved(ME);
}

/** A saved player I met in a game (so each of us has a name). */
function meet(id: string): void {
  const server = onlineFake.server();
  server.markSaved(id);
  server.createGame(ME, { white: ME, black: id }, 'portes', 3, null);
}

/** `id` and I become friends: they ask, I accept. */
async function befriend(id: string): Promise<void> {
  meet(id);
  const server = onlineFake.server();
  await server.friendsFor(id).sendRequest(ME);
  await server.friendsFor(ME).acceptRequest(id);
}

const nameOf = (id: string) => `Guest ${onlineFake.guestNumber(id)}`;

async function show(friends: Friends = onlineFake.friends) {
  const props = {
    onBack: jest.fn(),
    onAdd: jest.fn(),
    onInvite: jest.fn(),
    onOpenInvite: jest.fn(),
    onAccount: jest.fn(),
  };
  await render(
    <FriendsScreen auth={auth!} friends={friends} safety={onlineFake.safety} {...props} />,
  );
  await flush();
  return props;
}

describe('<FriendsScreen />', () => {
  it('a guest reads that friends need a saved account, with a way to Account', async () => {
    onlineFake.authStore.session = { id: ME, isGuest: true };
    const props = await show();
    expect(screen.getByTestId('friends-guest')).toBeOnTheScreen();
    await setupUser().press(screen.getByRole('button', { name: 'Save my account' }));
    expect(props.onAccount).toHaveBeenCalled();
  });

  it('with nobody signed in, says so and makes no account', async () => {
    const props = await show();
    expect(screen.getByTestId('friends-signed-out')).toBeOnTheScreen();
    expect(auth!.currentUser()).toBeNull();
    expect(props.onAccount).not.toHaveBeenCalled();
  });

  it('with no friends, says so and offers Add a friend', async () => {
    signInSaved();
    const props = await show();
    expect(screen.getByTestId('friends-empty')).toBeOnTheScreen();
    await setupUser().press(screen.getByRole('button', { name: 'Add a friend' }));
    expect(props.onAdd).toHaveBeenCalled();
  });

  it('loads again each time the screen shows (a new visit)', async () => {
    signInSaved();
    const props = {
      onBack: jest.fn(),
      onAdd: jest.fn(),
      onInvite: jest.fn(),
      onOpenInvite: jest.fn(),
      onAccount: jest.fn(),
    };
    const ui = (visit: number) => (
      <FriendsScreen
        auth={auth!}
        friends={onlineFake.friends}
        safety={onlineFake.safety}
        visit={visit}
        {...props}
      />
    );
    await render(ui(1));
    await flush();
    expect(screen.getByTestId('friends-empty')).toBeOnTheScreen();
    // A friend is added on another screen; then the player comes back.
    await befriend('ann');
    await screen.rerender(ui(1));
    await flush();
    expect(screen.queryByText(nameOf('ann'))).toBeNull();
    await screen.rerender(ui(2));
    await flush();
    expect(screen.getByText(nameOf('ann'))).toBeOnTheScreen();
  });

  it('keeps the list when a reload on the way back fails on the network', async () => {
    signInSaved();
    await befriend('ann');
    let down = false;
    const flaky: Friends = {
      ...onlineFake.friends,
      listFriends: () =>
        down ? Promise.reject(new Error('offline')) : onlineFake.friends.listFriends(),
    };
    const props = {
      onBack: jest.fn(),
      onAdd: jest.fn(),
      onInvite: jest.fn(),
      onOpenInvite: jest.fn(),
      onAccount: jest.fn(),
    };
    const ui = (visit: number) => (
      <FriendsScreen
        auth={auth!}
        friends={flaky}
        safety={onlineFake.safety}
        visit={visit}
        {...props}
      />
    );
    await render(ui(1));
    await flush();
    expect(screen.getByText(nameOf('ann'))).toBeOnTheScreen();
    down = true;
    await screen.rerender(ui(2));
    await flush();
    expect(screen.getByText(nameOf('ann'))).toBeOnTheScreen();
  });

  it('lists friends with the record, and Invite opens the setup for that friend', async () => {
    signInSaved();
    await befriend('ann');
    const props = await show();
    expect(screen.getByText(nameOf('ann'))).toBeOnTheScreen();
    expect(screen.getByText('Matches: you won 0, they won 0')).toBeOnTheScreen();
    await setupUser().press(
      screen.getByRole('button', { name: `Invite ${nameOf('ann')} to a game` }),
    );
    expect(props.onInvite).toHaveBeenCalledWith('ann');
  });

  it('Accept makes a friend; Decline takes the request away', async () => {
    signInSaved();
    meet('ann');
    meet('bob');
    await onlineFake.server().friendsFor('ann').sendRequest(ME);
    await onlineFake.server().friendsFor('bob').sendRequest(ME);
    await show();
    const user = setupUser();
    await user.press(screen.getByRole('button', { name: `Accept ${nameOf('ann')}` }));
    await flush();
    expect(screen.getByTestId('friend-ann')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: `Decline ${nameOf('bob')}` }));
    await flush();
    expect(screen.queryByTestId('friends-incoming')).toBeNull();
    const { incoming } = await onlineFake.server().friendsFor(ME).listRequests();
    expect(incoming).toEqual([]);
  });

  it('Cancel takes back a request I sent', async () => {
    signInSaved();
    meet('ann');
    await onlineFake.server().friendsFor(ME).sendRequest('ann');
    await show();
    await setupUser().press(
      screen.getByRole('button', { name: `Cancel your request to ${nameOf('ann')}` }),
    );
    await flush();
    expect(screen.queryByTestId('friends-outgoing')).toBeNull();
  });

  it('Remove asks first, then ends the friendship', async () => {
    signInSaved();
    await befriend('ann');
    await show();
    const user = setupUser();
    await user.press(screen.getByRole('button', { name: `Remove ${nameOf('ann')}` }));
    expect(screen.getByText(`Remove ${nameOf('ann')}?`)).toBeOnTheScreen();
    await user.press(screen.getByTestId('dialog-cancel'));
    expect(screen.getByTestId('friend-ann')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: `Remove ${nameOf('ann')}` }));
    await user.press(screen.getByTestId('dialog-confirm'));
    await flush();
    expect(screen.queryByTestId('friend-ann')).toBeNull();
    expect(await onlineFake.server().friendsFor(ME).listFriends()).toEqual([]);
  });

  it('Report or block opens the sheet; a block ends the friendship', async () => {
    signInSaved();
    await befriend('ann');
    await show();
    const user = setupUser();
    await user.press(screen.getByRole('button', { name: `Report or block ${nameOf('ann')}` }));
    await flush();
    await user.press(await screen.findByTestId('safety-block'));
    await user.press(screen.getByTestId('safety-block-yes'));
    await flush();
    await user.press(screen.getByTestId('safety-close'));
    await flush();
    expect(screen.queryByTestId('friend-ann')).toBeNull();
  });

  it('shows a friend invite to me; Open opens the invite', async () => {
    signInSaved();
    await befriend('ann');
    const code = await onlineFake
      .server()
      .friendsFor('ann')
      .inviteFriend(ME, { choice: 'plakoto', targetPoints: 5, turnTimeMinutes: null });
    const props = await show();
    expect(screen.getByText(`${nameOf('ann')} invites you`)).toBeOnTheScreen();
    expect(screen.getByText('Plakoto, 5 points')).toBeOnTheScreen();
    await setupUser().press(screen.getByTestId(`friend-invite-${code}-open`));
    expect(props.onOpenInvite).toHaveBeenCalledWith(code);
  });

  it('a failed call keeps the list and says why', async () => {
    signInSaved();
    await befriend('ann');
    const removeFriend = jest.fn().mockRejectedValue(new Error('offline'));
    await show({ ...onlineFake.friends, removeFriend });
    const user = setupUser();
    await user.press(screen.getByRole('button', { name: `Remove ${nameOf('ann')}` }));
    await user.press(screen.getByTestId('dialog-confirm'));
    await flush();
    expect(screen.getByTestId('friends-problem')).toHaveTextContent(
      'That did not work. Check the connection and try again.',
    );
    expect(screen.getByTestId('friend-ann')).toBeOnTheScreen();
  });

  it('a failed load offers Try again', async () => {
    signInSaved();
    const listFriends = jest.fn().mockRejectedValueOnce(new Error('offline'));
    listFriends.mockImplementation(() => onlineFake.friends.listFriends());
    await show({ ...onlineFake.friends, listFriends });
    expect(screen.getByTestId('friends-failed')).toBeOnTheScreen();
    await setupUser().press(screen.getByRole('button', { name: 'Try again' }));
    await flush();
    expect(screen.getByTestId('friends-empty')).toBeOnTheScreen();
  });
});
