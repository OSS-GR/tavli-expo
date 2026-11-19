/**
 * A friend link (#406), on the Jest online fake: whose link it is, and
 * the Yes/No prompt that adds both at once (#638).
 */
import { act, render, screen } from '@testing-library/react-native';

import { auth, usernames } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { markNamed } from '@tavli/online/testing';

import { onlineFake } from '../../../test/onlineFake';

import { FriendLinkScreen } from './FriendLinkScreen';

runOnFakeTimers();

const ME = 'me';
const ANN = 'ann';

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

/** Ann's friend link token. Ann has a username (a friend link needs one, #599). */
async function annLink(): Promise<string> {
  const server = onlineFake.server();
  await markNamed(server, ANN);
  server.createGame(ANN, { white: ANN, black: ME }, 'portes', 3, null);
  return await server.friendsFor(ANN).myFriendLink();
}

async function show(token: string | null) {
  const props = { onBack: jest.fn(), onFriends: jest.fn(), onAccount: jest.fn() };
  await render(
    <FriendLinkScreen
      token={token}
      auth={auth!}
      usernames={usernames!}
      friends={onlineFake.friends}
      {...props}
    />,
  );
  await flush();
  return props;
}

const annName = () => `U_${ANN}`;

describe('<FriendLinkScreen />', () => {
  it('asks before it adds; Yes makes us friends both ways at once (#638)', async () => {
    const token = await annLink();
    onlineFake.authStore.session = { id: ME, isGuest: false };
    await markNamed(onlineFake.server(), ME);
    const props = await show(token);
    expect(screen.getByText(`This is the friend link of ${annName()}.`)).toBeOnTheScreen();
    expect(screen.getByTestId('friend-link-confirm')).toHaveTextContent(
      `You are about to add ${annName()} as your friend.`,
    );
    await setupUser().press(screen.getByRole('button', { name: 'Yes, add' }));
    await flush();
    expect(screen.getByTestId('friend-link-status')).toHaveTextContent(
      `You and ${annName()} are friends.`,
    );
    const annFriends = await onlineFake.server().friendsFor(ANN).listFriends();
    expect(annFriends.map((f) => f.playerId)).toEqual([ME]);
    expect(await onlineFake.server().friendsFor(ANN).listRequests()).toEqual({
      incoming: [],
      outgoing: [],
    });
    expect(props.onBack).not.toHaveBeenCalled();
  });

  it('No goes back and adds nobody (#638)', async () => {
    const token = await annLink();
    onlineFake.authStore.session = { id: ME, isGuest: false };
    await markNamed(onlineFake.server(), ME);
    const props = await show(token);
    await setupUser().press(screen.getByRole('button', { name: 'No' }));
    expect(props.onBack).toHaveBeenCalled();
    expect(await onlineFake.server().friendsFor(ANN).listFriends()).toEqual([]);
  });

  it('when the owner asked me first, Yes makes us friends', async () => {
    const token = await annLink();
    onlineFake.authStore.session = { id: ME, isGuest: false };
    await markNamed(onlineFake.server(), ME);
    await onlineFake.server().friendsFor(ANN).sendRequest(ME);
    const props = await show(token);
    await setupUser().press(screen.getByRole('button', { name: 'Yes, add' }));
    await flush();
    expect(screen.getByTestId('friend-link-status')).toHaveTextContent(
      `You and ${annName()} are friends.`,
    );
    await setupUser().press(screen.getByRole('button', { name: 'See your friends' }));
    expect(props.onFriends).toHaveBeenCalled();
  });

  it('a saved account with no username picks one first, then Yes works (#599)', async () => {
    const token = await annLink();
    onlineFake.authStore.session = { id: ME, isGuest: false };
    onlineFake.server().markSaved(ME);
    await show(token);
    expect(screen.getByTestId('friend-link-username-gate')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Yes, add' })).toBeNull();
    const user = setupUser();
    await user.type(screen.getByTestId('username-input'), 'Orestis');
    await user.press(screen.getByTestId('username-terms'));
    await user.press(screen.getByTestId('username-age'));
    await user.press(screen.getByTestId('username-save'));
    await flush();
    expect(screen.queryByTestId('friend-link-username-gate')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Yes, add' }));
    await flush();
    expect(screen.getByTestId('friend-link-status')).toHaveTextContent(
      `You and ${annName()} are friends.`,
    );
  });

  it('a guest sees whose link it is and a way to save the account', async () => {
    const token = await annLink();
    onlineFake.authStore.session = { id: ME, isGuest: true };
    const props = await show(token);
    expect(screen.getByTestId('friend-link-guest')).toBeOnTheScreen();
    expect(screen.getByTestId('friend-link-benefits')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Yes, add' })).toBeNull();
    await setupUser().press(screen.getByRole('button', { name: 'Save my account' }));
    expect(props.onAccount).toHaveBeenCalled();
  });

  it('my own link says so', async () => {
    onlineFake.authStore.session = { id: ANN, isGuest: false };
    await show(await annLink());
    expect(screen.getByTestId('friend-link-self')).toBeOnTheScreen();
  });

  it('a link that does not work reads the same as no token', async () => {
    onlineFake.authStore.session = { id: ME, isGuest: false };
    await show('ABCDEFGH23456789');
    expect(screen.getByTestId('friend-link-not-found')).toBeOnTheScreen();
    await act(async () => screen.unmount());
    await show(null);
    expect(screen.getByTestId('friend-link-not-found')).toBeOnTheScreen();
  });

  it('with nobody signed in, says so and makes no account', async () => {
    await show(await annLink());
    expect(screen.getByTestId('friend-link-signed-out')).toBeOnTheScreen();
    expect(auth!.currentUser()).toBeNull();
  });
});
