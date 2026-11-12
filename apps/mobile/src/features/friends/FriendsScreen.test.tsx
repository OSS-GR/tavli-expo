/**
 * Friends (#406), on the Jest online fake: the list, requests both ways,
 * Remove, Invite (and its short confirm with the last setup, #488),
 * Report or block, and friend invites to you.
 */
import type { Friends, NewInvite, Ratings } from '@tavli/contracts';
import { act, render, screen } from '@testing-library/react-native';

import {
  FRIEND_INVITE_SETUP_KEY,
  saveFriendInviteSetup,
} from '@/features/invites/friendInviteSetup';
import { TOAST_MS } from '@/components/Toast';
import { analytics, auth, storage } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { onlineFake } from '../../../test/onlineFake';

import { FriendsScreen } from './FriendsScreen';
import { noteInviteSent, takeInviteSent } from './inviteSent';

runOnFakeTimers();

// The last friend-invite setup stays in storage between tests.
afterEach(() => {
  storage.remove(FRIEND_INVITE_SETUP_KEY);
});

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

/** Opens the friend sheet of `id` (the row's "more" button). */
async function openSheet(user: ReturnType<typeof setupUser>, id: string): Promise<void> {
  await user.press(screen.getByRole('button', { name: `More for ${nameOf(id)}` }));
  expect(screen.getByTestId('friend-sheet')).toBeOnTheScreen();
}

async function show(friends: Friends = onlineFake.friends, ratings?: Ratings) {
  const props = {
    onBack: jest.fn(),
    onAdd: jest.fn(),
    onRatings: jest.fn(),
    onInvite: jest.fn(),
    onInvited: jest.fn(),
    onOpenInvite: jest.fn(),
    onAccount: jest.fn(),
  };
  await render(
    <FriendsScreen
      auth={auth!}
      friends={friends}
      safety={onlineFake.safety}
      {...(ratings === undefined ? {} : { ratings })}
      {...props}
    />,
  );
  await flush();
  return props;
}

describe('<FriendsScreen />', () => {
  it('a guest reads that friends need a saved account, with a way to Account', async () => {
    onlineFake.authStore.session = { id: ME, isGuest: true };
    const props = await show();
    expect(screen.getByTestId('friends-guest')).toBeOnTheScreen();
    // What a saved account gives (#463).
    expect(screen.getByTestId('friends-benefits')).toBeOnTheScreen();
    await setupUser().press(screen.getByRole('button', { name: 'Save my account' }));
    expect(props.onAccount).toHaveBeenCalled();
  });

  it('with nobody signed in, says so and makes no account', async () => {
    const props = await show();
    expect(screen.getByTestId('friends-signed-out')).toBeOnTheScreen();
    expect(auth!.currentUser()).toBeNull();
    expect(props.onAccount).not.toHaveBeenCalled();
  });

  it('with no friends, shows the empty state: Add a friend and a Leaderboards link', async () => {
    signInSaved();
    const mine = jest
      .fn()
      .mockResolvedValue({ rating: 1490, matches: 1, shown: true, listed: false });
    const props = await show(onlineFake.friends, { ...onlineFake.ratings, mine });
    // The empty state shows no rating, so it asks for none.
    expect(mine).not.toHaveBeenCalled();
    expect(screen.getByTestId('friends-empty')).toHaveTextContent('No friends yet');
    expect(screen.getByTestId('friends-medallion', { includeHiddenElements: true })).toBeTruthy();
    // Only one Add a friend: the empty state's.
    expect(screen.getAllByRole('button', { name: 'Add a friend' })).toHaveLength(1);
    expect(screen.queryByTestId('friends-list')).toBeNull();
    const user = setupUser();
    await user.press(screen.getByRole('button', { name: 'Add a friend' }));
    expect(props.onAdd).toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Leaderboards' }));
    expect(props.onRatings).toHaveBeenCalled();
  });

  it('with a request but no friend, shows the list and says it has no friend', async () => {
    signInSaved();
    meet('ann');
    await onlineFake.server().friendsFor('ann').sendRequest(ME);
    await show();
    expect(screen.getByTestId('friends-incoming')).toBeOnTheScreen();
    expect(screen.getByTestId('friends-list')).toBeOnTheScreen();
    expect(screen.getByTestId('friends-empty')).toHaveTextContent(
      'No friends yet. Tap Add a friend.',
    );
  });

  it('shows my rating on the Leaderboards row once I have a rated match', async () => {
    signInSaved();
    await befriend('ann');
    const mine = jest
      .fn()
      .mockResolvedValue({ rating: 1490, matches: 1, shown: true, listed: false });
    const ratings = { ...onlineFake.ratings, mine };
    const props = await show(onlineFake.friends, ratings);
    expect(screen.getByTestId('friends-rating-chip')).toHaveTextContent('1490');
    const row = screen.getByRole('button', { name: 'Leaderboards, your rating 1490' });
    await setupUser().press(row);
    expect(props.onRatings).toHaveBeenCalled();
  });

  it('shows no rating chip before the first rated match', async () => {
    signInSaved();
    await befriend('ann');
    const mine = jest
      .fn()
      .mockResolvedValue({ rating: 1500, matches: 0, shown: true, listed: false });
    await show(onlineFake.friends, { ...onlineFake.ratings, mine });
    expect(screen.getByRole('button', { name: 'Leaderboards' })).toBeOnTheScreen();
    expect(screen.queryByTestId('friends-rating-chip')).toBeNull();
  });

  it('shows no rating chip when the rating call fails, and no problem line', async () => {
    signInSaved();
    await befriend('ann');
    const failing = jest.fn().mockRejectedValue(new Error('offline'));
    await show(onlineFake.friends, { ...onlineFake.ratings, mine: failing });
    expect(screen.queryByTestId('friends-rating-chip')).toBeNull();
    expect(screen.queryByTestId('friends-problem')).toBeNull();
  });

  it('loads again each time the screen shows (a new visit)', async () => {
    signInSaved();
    const props = {
      onBack: jest.fn(),
      onAdd: jest.fn(),
      onInvite: jest.fn(),
      onInvited: jest.fn(),
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

  it('keeps the list and says it may be old when a reload on the way back fails', async () => {
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
      onInvited: jest.fn(),
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
    expect(screen.getByTestId('friends-refresh-failed')).toHaveTextContent(
      'This may be out of date: it did not load again. Check the connection and try again.',
    );
    // Try again loads quietly: the list stays, the note goes.
    down = false;
    await befriend('bob');
    await setupUser().press(screen.getByTestId('friends-refresh-retry'));
    await flush();
    expect(screen.getByText(nameOf('bob'))).toBeOnTheScreen();
    expect(screen.queryByTestId('friends-refresh-failed')).toBeNull();
  });

  it('lists friends with a count, and Invite with no saved setup opens the full setup', async () => {
    signInSaved();
    await befriend('ann');
    const props = await show();
    expect(screen.getByText(nameOf('ann'))).toBeOnTheScreen();
    // The section header counts the friends.
    expect(screen.getByText('1')).toBeOnTheScreen();
    // No finished match yet: no record line.
    expect(screen.queryByText(/lead|Even at/)).toBeNull();
    await setupUser().press(
      screen.getByRole('button', { name: `Invite ${nameOf('ann')} to a game` }),
    );
    expect(props.onInvite).toHaveBeenCalledWith('ann');
  });

  describe('Invite with the last setup (#488)', () => {
    const LAST: NewInvite = { choice: 'plakoto', targetPoints: 3, turnTimeMinutes: null };

    it('asks first with the setup, and says nothing of the 24-hour default', async () => {
      signInSaved();
      await befriend('ann');
      saveFriendInviteSetup(LAST);
      const props = await show();
      await setupUser().press(
        screen.getByRole('button', { name: `Invite ${nameOf('ann')} to a game` }),
      );
      expect(screen.getByRole('header', { name: `Invite ${nameOf('ann')}?` })).toBeOnTheScreen();
      expect(screen.getByText('Plakoto, first to 3 points')).toBeOnTheScreen();
      expect(screen.queryByText(/per turn|24 hours/)).toBeNull();
      expect(props.onInvite).not.toHaveBeenCalled();
      expect(await onlineFake.server().friendsFor('ann').listFriendInvites()).toEqual([]);
    });

    it('names a turn timer when the setup has one', async () => {
      signInSaved();
      await befriend('ann');
      saveFriendInviteSetup({ choice: 'portes', targetPoints: 1, turnTimeMinutes: 5 });
      await show();
      await setupUser().press(
        screen.getByRole('button', { name: `Invite ${nameOf('ann')} to a game` }),
      );
      expect(screen.getByText('Portes, first to 1 point')).toBeOnTheScreen();
      expect(screen.getByText('5 minutes per turn')).toBeOnTheScreen();
    });

    it('Send sends that setup to the friend and stays, with "Invite sent" (#507)', async () => {
      signInSaved();
      await befriend('ann');
      saveFriendInviteSetup(LAST);
      const sent = jest.spyOn(analytics, 'track');
      const props = await show();
      const user = setupUser();
      await user.press(screen.getByRole('button', { name: `Invite ${nameOf('ann')} to a game` }));
      await user.press(screen.getByTestId('friend-quick-send'));
      await flush();
      expect(props.onInvited).toHaveBeenCalledTimes(1);
      const code = props.onInvited.mock.calls[0]![0] as string;
      const toAnn = await onlineFake.server().friendsFor('ann').listFriendInvites();
      expect(toAnn).toEqual([expect.objectContaining({ code, ...LAST })]);
      expect(sent).toHaveBeenCalledWith('invite_created', {
        game: 'plakoto',
        matchLength: 3,
        turnTimeMinutes: undefined,
      });
      expect(screen.queryByTestId('friend-quick-dialog')).toBeNull();
      expect(props.onInvite).not.toHaveBeenCalled();
      // The friend gets a push and needs no link: the screen stays and says so.
      expect(screen.getByTestId('friends-sent')).toHaveTextContent(
        `Invite sent to ${nameOf('ann')}`,
      );
      expect(screen.getByTestId('friends-screen')).toBeOnTheScreen();
      // The toast closes by itself.
      await act(async () => {
        jest.advanceTimersByTime(TOAST_MS);
      });
      expect(screen.queryByTestId('friends-sent')).toBeNull();
      sent.mockRestore();
    });

    it('a send from the full setup comes back with "Invite sent" (#507)', async () => {
      signInSaved();
      await befriend('ann');
      noteInviteSent({ playerId: 'ann', code: 'ABCD2345' });
      await show();
      expect(screen.getByTestId('friends-sent')).toHaveTextContent(
        `Invite sent to ${nameOf('ann')}`,
      );
      // The note is shown once.
      expect(takeInviteSent()).toBeNull();
    });

    it('Change opens the full setup; Cancel sends nothing', async () => {
      signInSaved();
      await befriend('ann');
      saveFriendInviteSetup(LAST);
      const props = await show();
      const user = setupUser();
      const invite = () =>
        user.press(screen.getByRole('button', { name: `Invite ${nameOf('ann')} to a game` }));
      await invite();
      await user.press(screen.getByTestId('friend-quick-cancel'));
      expect(screen.queryByTestId('friend-quick-dialog')).toBeNull();
      expect(props.onInvite).not.toHaveBeenCalled();
      await invite();
      await user.press(screen.getByTestId('friend-quick-change'));
      expect(props.onInvite).toHaveBeenCalledWith('ann');
      expect(props.onInvited).not.toHaveBeenCalled();
      expect(await onlineFake.server().friendsFor('ann').listFriendInvites()).toEqual([]);
    });

    it('a failed send closes the confirm and says why', async () => {
      signInSaved();
      await befriend('ann');
      saveFriendInviteSetup(LAST);
      const inviteFriend = jest
        .fn()
        .mockRejectedValue({ code: 'TOO_MANY_INVITES', message: 'too many' });
      const props = await show({ ...onlineFake.friends, inviteFriend });
      const user = setupUser();
      await user.press(screen.getByRole('button', { name: `Invite ${nameOf('ann')} to a game` }));
      await user.press(screen.getByTestId('friend-quick-send'));
      await flush();
      expect(screen.queryByTestId('friend-quick-dialog')).toBeNull();
      expect(screen.getByTestId('friends-problem')).toHaveTextContent(
        'You have too many open invites. Cancel one first.',
      );
      expect(props.onInvited).not.toHaveBeenCalled();
    });
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

  it('the friend sheet shows since when, and Invite to a game invites', async () => {
    signInSaved();
    await befriend('ann');
    const props = await show();
    const user = setupUser();
    await openSheet(user, 'ann');
    expect(screen.getByRole('header', { name: nameOf('ann') })).toBeOnTheScreen();
    expect(screen.getByText(/^Friends since /)).toBeOnTheScreen();
    await user.press(screen.getByTestId('friend-sheet-invite'));
    // No saved setup: the full setup opens, and the sheet closes.
    expect(props.onInvite).toHaveBeenCalledWith('ann');
    expect(screen.queryByTestId('friend-sheet')).toBeNull();
  });

  it('Remove asks first, then ends the friendship', async () => {
    signInSaved();
    await befriend('ann');
    await show();
    const user = setupUser();
    await openSheet(user, 'ann');
    await user.press(screen.getByRole('button', { name: `Remove ${nameOf('ann')}` }));
    // The confirm takes the sheet's place: one sheet at a time.
    expect(screen.queryByTestId('friend-sheet')).toBeNull();
    expect(screen.getByText(`Remove ${nameOf('ann')}?`)).toBeOnTheScreen();
    await user.press(screen.getByTestId('dialog-cancel'));
    expect(screen.getByTestId('friend-ann')).toBeOnTheScreen();
    await openSheet(user, 'ann');
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
    await openSheet(user, 'ann');
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
    await openSheet(user, 'ann');
    await user.press(screen.getByRole('button', { name: `Remove ${nameOf('ann')}` }));
    await user.press(screen.getByTestId('dialog-confirm'));
    await flush();
    expect(screen.getByTestId('friends-problem')).toHaveTextContent(
      'That did not work. Check the connection and try again.',
    );
    expect(screen.getByTestId('friend-ann')).toBeOnTheScreen();
  });

  it.each([
    ['NOT_SAVED', 'friends-guest'],
    ['NOT_SIGNED_IN', 'friends-signed-out'],
  ])(
    'a call that gets %s shows that in place of the list, as a load would',
    async (code, shown) => {
      signInSaved();
      await befriend('ann');
      const removeFriend = jest.fn().mockRejectedValue({ code, message: 'no' });
      await show({ ...onlineFake.friends, removeFriend });
      const user = setupUser();
      await openSheet(user, 'ann');
      await user.press(screen.getByRole('button', { name: `Remove ${nameOf('ann')}` }));
      await user.press(screen.getByTestId('dialog-confirm'));
      await flush();
      expect(screen.getByTestId(shown)).toBeOnTheScreen();
      expect(screen.queryByTestId('friend-ann')).toBeNull();
      expect(screen.queryByTestId('friends-problem')).toBeNull();
    },
  );

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
