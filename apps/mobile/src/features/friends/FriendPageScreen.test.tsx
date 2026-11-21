/**
 * The friend page (#644), on the Jest online fake: the heading, the record,
 * matches in play and invites, Rematch, recent matches, the empty state and
 * the "…" menu. The game lists come from a small fake `GameTransport`.
 */
import type { Friends, GameSummary, GameTransport, OnlineGameStatus } from '@tavli/contracts';
import { ASYNC_TURN_TIME_MS } from '@tavli/contracts';
import { markNamed } from '@tavli/online/testing';
import { act, cleanup, render, screen } from '@testing-library/react-native';

import {
  FRIEND_INVITE_SETUP_KEY,
  loadFriendInviteSetup,
} from '@/features/invites/friendInviteSetup';
import { auth, storage, usernames } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { onlineFake } from '../../../test/onlineFake';

import { FriendPageScreen } from './FriendPageScreen';

runOnFakeTimers();

afterEach(() => {
  storage.remove(FRIEND_INVITE_SETUP_KEY);
});

const ME = 'me';
const ANN = 'ann';
const HOUR = 60 * 60 * 1000;
const nameOf = (id: string) => `U_${id}`;

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

async function signInSaved(): Promise<void> {
  onlineFake.authStore.session = { id: ME, isGuest: false };
  await markNamed(onlineFake.server(), ME);
}

async function befriend(id: string): Promise<void> {
  const server = onlineFake.server();
  await markNamed(server, id);
  server.createGame(ME, { white: ME, black: id }, 'portes', 3, null);
  await server.friendsFor(id).sendRequest(ME);
  await server.friendsFor(ME).acceptRequest(id);
}

function summary(gameId: string, fields: Partial<GameSummary> = {}): GameSummary {
  const now = Date.now();
  return {
    gameId,
    status: 'active',
    choice: 'portes',
    presetId: 'portes',
    variant: 'portes',
    targetPoints: 5,
    turnTimeMinutes: null,
    ranked: false,
    mySide: 'white',
    waitingFor: 'white',
    myTurn: true,
    score: { white: 2, black: 1 },
    winner: null,
    updatedAt: now - HOUR,
    turnDeadline: now - HOUR + ASYNC_TURN_TIME_MS,
    opponentId: ANN,
    opponentName: null,
    ...fields,
  };
}

function finished(gameId: string, daysAgo: number, fields: Partial<GameSummary> = {}) {
  return summary(gameId, {
    status: 'finished',
    waitingFor: null,
    myTurn: false,
    turnDeadline: null,
    winner: 'white',
    score: { white: 5, black: 3 },
    updatedAt: Date.now() - daysAgo * 24 * HOUR,
    ...fields,
  });
}

/** A `GameTransport` whose lists are fixed. */
function fakeGames(lists: Partial<Record<OnlineGameStatus, GameSummary[]>>): GameTransport {
  return {
    watchMyGames: (
      request: { status: OnlineGameStatus },
      onList: (games: readonly GameSummary[]) => void,
    ) => {
      let live = true;
      void Promise.resolve().then(() => {
        if (live) onList(lists[request.status] ?? []);
      });
      return () => {
        live = false;
      };
    },
  } as unknown as GameTransport;
}

async function show(games: GameTransport = fakeGames({}), friends: Friends = onlineFake.friends) {
  const props = {
    onBack: jest.fn(),
    onOpenGame: jest.fn(),
    onOpenInvite: jest.fn(),
    onInvite: jest.fn(),
    onInvited: jest.fn(),
    onHistory: jest.fn(),
    onAccount: jest.fn(),
  };
  await render(
    <FriendPageScreen
      playerId={ANN}
      auth={auth!}
      usernames={usernames!}
      friends={friends}
      games={games}
      safety={onlineFake.safety}
      {...props}
    />,
  );
  await flush();
  return props;
}

describe('<FriendPageScreen />', () => {
  it('a new friend: the name, since when, "No matches yet" and Invite', async () => {
    await signInSaved();
    await befriend(ANN);
    const props = await show();
    expect(screen.getByRole('header', { name: nameOf(ANN) })).toBeOnTheScreen();
    expect(screen.getByTestId('friend-page-sub')).toHaveTextContent(/^Friends since /);
    expect(screen.getByText('No matches yet')).toBeOnTheScreen();
    expect(screen.queryByTestId('friend-page-record')).toBeNull();
    expect(screen.queryByTestId('friend-page-active')).toBeNull();
    expect(screen.queryByTestId('friend-page-rematch')).toBeNull();
    await setupUser().press(screen.getByTestId('friend-page-invite'));
    expect(props.onInvite).toHaveBeenCalledWith(ANN);
  });

  it('never says "No matches yet" before the matches load: placeholders show (#672)', async () => {
    await signInSaved();
    await befriend(ANN);
    // The finished list never answers.
    const games = {
      watchMyGames: () => () => {},
    } as unknown as GameTransport;
    await show(games);
    expect(screen.getByRole('header', { name: nameOf(ANN) })).toBeOnTheScreen();
    expect(screen.getByTestId('friend-page-matches-skeleton')).toBeOnTheScreen();
    expect(screen.queryByTestId('friend-page-empty')).toBeNull();
    expect(screen.queryByTestId('friend-page-invite')).toBeNull();
    expect(screen.queryByTestId('friend-page-rematch')).toBeNull();
  });

  it('a second visit opens with the last page at once, then loads quietly (#672)', async () => {
    await signInSaved();
    await befriend(ANN);
    const games = fakeGames({ finished: [finished('m1', 1)] });
    await show(games);
    expect(screen.getByTestId('friend-page-rematch')).toBeOnTheScreen();
    await cleanup();

    // Nothing answers this time: what shows is what the last visit showed.
    const silent: Friends = { ...onlineFake.friends, listFriends: () => new Promise(() => {}) };
    const quiet = { watchMyGames: () => () => {} } as unknown as GameTransport;
    await show(quiet, silent);
    expect(screen.queryByTestId('friend-page-skeleton')).toBeNull();
    expect(screen.getByRole('header', { name: nameOf(ANN) })).toBeOnTheScreen();
    expect(screen.getByTestId('friend-page-rematch')).toBeOnTheScreen();
  });

  it('shows the record in numbers and words', async () => {
    await signInSaved();
    await befriend(ANN);
    const friends: Friends = {
      ...onlineFake.friends,
      listFriends: async () =>
        (await onlineFake.friends.listFriends()).map((f) => ({
          ...f,
          record: { wins: 12, losses: 9 },
        })),
    };
    await show(fakeGames({}), friends);
    expect(screen.getByText('12–9')).toBeOnTheScreen();
    expect(screen.getByText('You lead · 21 matches')).toBeOnTheScreen();
    expect(screen.getByLabelText('You lead, 12 to 9, 21 matches')).toBeOnTheScreen();
  });

  it('lists matches in play, your turn first, then invites; a tap opens each', async () => {
    await signInSaved();
    await befriend(ANN);
    const code = await onlineFake
      .server()
      .friendsFor(ANN)
      .inviteFriend(ME, { choice: 'fevga', targetPoints: 3, turnTimeMinutes: null });
    const games = fakeGames({
      active: [
        summary('mine'),
        summary('theirs', { myTurn: false, waitingFor: 'black' }),
        summary('other', { opponentId: 'bob' }),
      ],
    });
    const props = await show(games);
    expect(screen.getByText('Matches in play')).toBeOnTheScreen();
    expect(screen.getByText('3')).toBeOnTheScreen();
    expect(screen.queryByTestId('friend-page-active-other')).toBeNull();
    expect(screen.getByText('Your turn')).toBeOnTheScreen();
    expect(screen.getByText('Waiting for your friend')).toBeOnTheScreen();
    expect(screen.getByText('Invite for you')).toBeOnTheScreen();
    expect(screen.queryByText('No matches yet')).toBeNull();
    const user = setupUser();
    await user.press(screen.getByTestId('friend-page-active-mine'));
    expect(props.onOpenGame).toHaveBeenCalledWith('mine');
    await user.press(screen.getByTestId(`friend-page-active-${code}`));
    expect(props.onOpenInvite).toHaveBeenCalledWith(code);
  });

  it('Rematch sends the last match setup and stays, with "Invite sent"', async () => {
    await signInSaved();
    await befriend(ANN);
    const games = fakeGames({
      finished: [
        finished('last', 1, { choice: 'tavli', targetPoints: 5 }),
        finished('older', 3, { choice: 'plakoto', targetPoints: 3 }),
      ],
    });
    const props = await show(games);
    expect(screen.getByText('Same settings: Tavli · first to 5 points')).toBeOnTheScreen();
    expect(screen.queryByTestId('friend-page-invite')).toBeNull();
    const user = setupUser();
    await user.press(screen.getByTestId('friend-page-rematch'));
    await flush();
    expect(props.onInvited).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('friend-page-sent')).toHaveTextContent(
      `Invite sent to ${nameOf(ANN)}`,
    );
    expect(loadFriendInviteSetup()).toEqual({
      choice: 'tavli',
      targetPoints: 5,
      turnTimeMinutes: null,
    });
    const sent = await onlineFake.server().friendsFor(ANN).listFriendInvites();
    expect(sent.map((i) => [i.from, i.choice, i.targetPoints])).toEqual([[ME, 'tavli', 5]]);
    // Change opens the full setup.
    await user.press(screen.getByTestId('friend-page-change'));
    expect(props.onInvite).toHaveBeenCalledWith(ANN);
  });

  it('lists the 5 newest finished matches; History and a tap open them', async () => {
    await signInSaved();
    await befriend(ANN);
    const games = fakeGames({
      finished: [
        finished('g1', 1),
        finished('g2', 2, { winner: 'black', score: { white: 1, black: 3 } }),
        finished('g3', 3),
        finished('g4', 4),
        finished('g5', 5),
        finished('g6', 6),
      ],
    });
    const props = await show(games);
    expect(screen.getByText('Recent matches')).toBeOnTheScreen();
    expect(screen.getByTestId('friend-page-sub')).toHaveTextContent(/^Last match on /);
    for (const id of ['g1', 'g2', 'g3', 'g4', 'g5'])
      expect(screen.getByTestId(`friend-page-recent-${id}`)).toBeOnTheScreen();
    expect(screen.queryByTestId('friend-page-recent-g6')).toBeNull();
    expect(screen.getAllByText('Won')).toHaveLength(4);
    expect(screen.getAllByText('Lost')).toHaveLength(1);
    expect(screen.getByText('1–3')).toBeOnTheScreen();
    const user = setupUser();
    await user.press(screen.getByTestId('friend-page-recent-g2'));
    expect(props.onOpenGame).toHaveBeenCalledWith('g2');
    await user.press(screen.getByTestId('friend-page-history'));
    expect(props.onHistory).toHaveBeenCalled();
  });

  it('Remove asks first, ends the friendship and goes back', async () => {
    await signInSaved();
    await befriend(ANN);
    const props = await show();
    const user = setupUser();
    await user.press(screen.getByRole('button', { name: `More for ${nameOf(ANN)}` }));
    await user.press(screen.getByTestId('friend-page-remove'));
    expect(screen.getByTestId('friend-page-remove-dialog')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Remove' }));
    await flush();
    expect(props.onBack).toHaveBeenCalled();
    expect(await onlineFake.friends.listFriends()).toEqual([]);
  });

  it('after a block the friend is gone and the page says so', async () => {
    await signInSaved();
    await befriend(ANN);
    await show();
    const user = setupUser();
    await user.press(screen.getByRole('button', { name: `More for ${nameOf(ANN)}` }));
    await user.press(screen.getByTestId('friend-page-report'));
    await flush();
    await user.press(await screen.findByTestId('safety-block'));
    await user.press(screen.getByTestId('safety-block-yes'));
    await flush();
    await user.press(screen.getByTestId('safety-close'));
    await flush();
    expect(screen.getByTestId('friend-page-gone')).toHaveTextContent(
      'You are not friends any more.',
    );
    expect(screen.queryByTestId('friend-page-more')).toBeNull();
  });

  it('a player who is not a friend reads that', async () => {
    await signInSaved();
    await show();
    expect(screen.getByTestId('friend-page-gone')).toBeOnTheScreen();
  });

  it('a guest reads that friends need a saved account', async () => {
    onlineFake.authStore.session = { id: ME, isGuest: true };
    await show();
    expect(screen.getByTestId('friend-page-guest')).toBeOnTheScreen();
  });
});
