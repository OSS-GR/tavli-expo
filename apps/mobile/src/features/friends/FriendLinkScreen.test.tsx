/**
 * A friend link (#406), on the Jest online fake: whose link it is, and
 * "Ask to be friends".
 */
import { act, render, screen } from '@testing-library/react-native';

import { auth } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
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

/** Ann's friend link token. We met in a game, so Ann has a name. */
async function annLink(): Promise<string> {
  const server = onlineFake.server();
  server.markSaved(ANN);
  server.createGame(ANN, { white: ANN, black: ME }, 'portes', 3, null);
  return await server.friendsFor(ANN).myFriendLink();
}

async function show(token: string | null) {
  const props = { onBack: jest.fn(), onFriends: jest.fn(), onAccount: jest.fn() };
  await render(
    <FriendLinkScreen token={token} auth={auth!} friends={onlineFake.friends} {...props} />,
  );
  await flush();
  return props;
}

const annName = () => `Guest ${onlineFake.guestNumber(ANN)}`;

describe('<FriendLinkScreen />', () => {
  it('shows whose link it is; Ask sends the request', async () => {
    const token = await annLink();
    onlineFake.authStore.session = { id: ME, isGuest: false };
    await show(token);
    expect(screen.getByText(`This is the friend link of ${annName()}.`)).toBeOnTheScreen();
    await setupUser().press(screen.getByRole('button', { name: 'Ask to be friends' }));
    await flush();
    expect(screen.getByTestId('friend-link-status')).toHaveTextContent(
      'You asked. They have not answered yet.',
    );
    const { incoming } = await onlineFake.server().friendsFor(ANN).listRequests();
    expect(incoming.map((r) => r.playerId)).toEqual([ME]);
  });

  it('when the owner asked me first, Accept makes us friends', async () => {
    const token = await annLink();
    onlineFake.authStore.session = { id: ME, isGuest: false };
    onlineFake.server().markSaved(ME);
    await onlineFake.server().friendsFor(ANN).sendRequest(ME);
    const props = await show(token);
    await setupUser().press(screen.getByRole('button', { name: 'Accept' }));
    await flush();
    expect(screen.getByTestId('friend-link-status')).toHaveTextContent(
      `You and ${annName()} are friends.`,
    );
    await setupUser().press(screen.getByRole('button', { name: 'See your friends' }));
    expect(props.onFriends).toHaveBeenCalled();
  });

  it('a guest sees whose link it is and a way to save the account', async () => {
    const token = await annLink();
    onlineFake.authStore.session = { id: ME, isGuest: true };
    const props = await show(token);
    expect(screen.getByTestId('friend-link-guest')).toBeOnTheScreen();
    expect(screen.getByTestId('friend-link-benefits')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Ask to be friends' })).toBeNull();
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
