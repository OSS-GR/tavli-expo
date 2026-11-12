/**
 * Add a friend (#406), on the Jest online fake: the link and QR code,
 * Share and Text message, username search, a pasted link and recent
 * players. Nothing here reads the contacts.
 */
import { TERMS_VERSION, type Friends } from '@tavli/contracts';
import { act, render, screen } from '@testing-library/react-native';
import { Linking, Share } from 'react-native';

import { auth } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { onlineFake } from '../../../test/onlineFake';

import { AddFriendScreen } from './AddFriendScreen';

runOnFakeTimers();

const ME = 'me';
const STEP = { acceptTerms: TERMS_VERSION, ageChecked: true } as const;

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

function signInSaved(): void {
  onlineFake.authStore.session = { id: ME, isGuest: false };
  onlineFake.server().markSaved(ME);
}

/** A saved player I met in a game. */
function meet(id: string): void {
  const server = onlineFake.server();
  server.markSaved(id);
  server.createGame(ME, { white: ME, black: id }, 'portes', 3, null);
}

const nameOf = (id: string) => `Guest ${onlineFake.guestNumber(id)}`;

async function show(friends: Friends = onlineFake.friends) {
  const props = { onBack: jest.fn(), onLink: jest.fn(), onAccount: jest.fn() };
  await render(<AddFriendScreen auth={auth!} friends={friends} {...props} />);
  await flush();
  return props;
}

async function myLink(): Promise<string> {
  return `tavlaki://add/${await onlineFake.server().friendsFor(ME).myFriendLink()}`;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('<AddFriendScreen />', () => {
  it('a guest reads that friends need a saved account', async () => {
    onlineFake.authStore.session = { id: ME, isGuest: true };
    await show();
    expect(screen.getByTestId('add-friend-guest')).toBeOnTheScreen();
  });

  it('shows my friend link and its QR code', async () => {
    signInSaved();
    await show();
    const link = await myLink();
    expect(screen.getByTestId('add-friend-link')).toHaveTextContent(link);
    expect(screen.getByRole('image', { name: 'QR code of your friend link' })).toBeOnTheScreen();
  });

  it('Share link opens the share sheet, Message the Messages app, with the link', async () => {
    signInSaved();
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await show();
    const link = await myLink();
    const user = setupUser();
    await user.press(screen.getByRole('button', { name: 'Share link' }));
    expect(share).toHaveBeenCalledWith({ message: `Be my friend on Tavlaki: ${link}` });
    await user.press(screen.getByRole('button', { name: 'Message' }));
    const url = open.mock.calls[0]![0];
    expect(url).toMatch(/^sms:[&?]body=/);
    expect(decodeURIComponent(url)).toContain(link);
  });

  it('New link asks first, then shows a new link; the old one stops working', async () => {
    signInSaved();
    await show();
    const old = await myLink();
    const user = setupUser();
    await user.press(screen.getByRole('button', { name: 'Make a new link' }));
    await user.press(screen.getByTestId('dialog-confirm'));
    await flush();
    const now = await myLink();
    expect(now).not.toBe(old);
    expect(screen.getByTestId('add-friend-link')).toHaveTextContent(now);
  });

  it('after New link, a later load shows the link the server has', async () => {
    signInSaved();
    const props = { onBack: jest.fn(), onLink: jest.fn(), onAccount: jest.fn() };
    const ui = (visit: number) => (
      <AddFriendScreen auth={auth!} friends={onlineFake.friends} visit={visit} {...props} />
    );
    await render(ui(1));
    await flush();
    const user = setupUser();
    await user.press(screen.getByRole('button', { name: 'Make a new link' }));
    await user.press(screen.getByTestId('dialog-confirm'));
    await flush();
    expect(screen.getByTestId('add-friend-link')).toHaveTextContent(await myLink());
    // The link changes another way (another phone), then the screen loads again.
    await onlineFake.server().friendsFor(ME).resetFriendLink();
    await screen.rerender(ui(2));
    await flush();
    expect(screen.getByTestId('add-friend-link')).toHaveTextContent(await myLink());
  });

  it('a load that started before New link never brings the old link back', async () => {
    signInSaved();
    // While `held` is a list, myFriendLink waits until the test lets it answer.
    let held: (() => void)[] | null = null;
    const slow: Friends = {
      ...onlineFake.friends,
      myFriendLink: async () => {
        const token = await onlineFake.friends.myFriendLink();
        if (held !== null) {
          const wait = held;
          await new Promise<void>((resolve) => wait.push(resolve));
        }
        return token;
      },
    };
    const props = { onBack: jest.fn(), onLink: jest.fn(), onAccount: jest.fn() };
    const ui = (visit: number) => (
      <AddFriendScreen auth={auth!} friends={slow} visit={visit} {...props} />
    );
    await render(ui(1));
    await flush();
    const old = await myLink();
    // The player comes back: a load starts and waits with the old link.
    const waiting: (() => void)[] = [];
    held = waiting;
    await screen.rerender(ui(2));
    await flush();
    expect(waiting).toHaveLength(1);
    held = null;
    const user = setupUser();
    await user.press(screen.getByRole('button', { name: 'Make a new link' }));
    await user.press(screen.getByTestId('dialog-confirm'));
    await flush();
    const fresh = await myLink();
    expect(fresh).not.toBe(old);
    expect(screen.getByTestId('add-friend-link')).toHaveTextContent(fresh);
    // The waiting load answers with the old link: it is dropped.
    await act(async () => {
      for (const answer of waiting) answer();
    });
    await flush();
    expect(screen.getByTestId('add-friend-link')).toHaveTextContent(fresh);
  });

  it('on a new visit, shows no QR code and shares nothing until the link loads', async () => {
    signInSaved();
    let held: (() => void)[] | null = null;
    let down = false;
    const slow: Friends = {
      ...onlineFake.friends,
      myFriendLink: async () => {
        if (down) throw new Error('offline');
        const token = await onlineFake.friends.myFriendLink();
        if (held !== null) {
          const wait = held;
          await new Promise<void>((resolve) => wait.push(resolve));
        }
        return token;
      },
    };
    const share = jest.spyOn(Share, 'share');
    const props = { onBack: jest.fn(), onLink: jest.fn(), onAccount: jest.fn() };
    const ui = (visit: number) => (
      <AddFriendScreen auth={auth!} friends={slow} visit={visit} {...props} />
    );
    await render(ui(1));
    await flush();
    expect(screen.getByTestId('add-friend-qr')).toBeOnTheScreen();
    // The link was reset on another phone; the player comes back.
    await onlineFake.server().friendsFor(ME).resetFriendLink();
    const waiting: (() => void)[] = [];
    held = waiting;
    await screen.rerender(ui(2));
    await flush();
    expect(screen.queryByTestId('add-friend-qr')).toBeNull();
    expect(screen.getByTestId('add-friend-checking')).toHaveTextContent('Checking your link…');
    const user = setupUser();
    await user.press(screen.getByRole('button', { name: 'Share link' }));
    expect(share).not.toHaveBeenCalled();
    held = null;
    await act(async () => {
      for (const answer of waiting) answer();
    });
    await flush();
    expect(screen.getByTestId('add-friend-link')).toHaveTextContent(await myLink());
    // A reload that fails keeps the link hidden and says why.
    down = true;
    await screen.rerender(ui(3));
    await flush();
    expect(screen.queryByTestId('add-friend-qr')).toBeNull();
    expect(screen.getByTestId('add-friend-refresh-failed')).toBeOnTheScreen();
    down = false;
    await user.press(screen.getByTestId('add-friend-refresh-retry'));
    await flush();
    expect(screen.getByTestId('add-friend-qr')).toBeOnTheScreen();
    expect(screen.queryByTestId('add-friend-refresh-failed')).toBeNull();
  });

  it('after New link, a failed reload keeps the new link shown and shareable', async () => {
    signInSaved();
    let down = false;
    const flaky: Friends = {
      ...onlineFake.friends,
      recentPlayers: async () => {
        if (down) throw new Error('offline');
        return onlineFake.friends.recentPlayers();
      },
    };
    await show(flaky);
    down = true;
    const user = setupUser();
    await user.press(screen.getByRole('button', { name: 'Make a new link' }));
    await user.press(screen.getByTestId('dialog-confirm'));
    await flush();
    // The server just gave this link: it is right, though the reload failed.
    expect(screen.getByTestId('add-friend-refresh-failed')).toBeOnTheScreen();
    expect(screen.getByTestId('add-friend-qr')).toBeOnTheScreen();
    expect(screen.getByTestId('add-friend-link')).toHaveTextContent(await myLink());
    expect(screen.getByRole('button', { name: 'Share link' })).toBeEnabled();
  });

  it('after Ask, a failed reload keeps the link of this visit shown', async () => {
    signInSaved();
    meet('ann');
    let down = false;
    const flaky: Friends = {
      ...onlineFake.friends,
      myFriendLink: async () => {
        if (down) throw new Error('offline');
        return onlineFake.friends.myFriendLink();
      },
    };
    await show(flaky);
    down = true;
    await setupUser().press(
      screen.getByRole('button', { name: `Ask ${nameOf('ann')} to be friends` }),
    );
    await flush();
    expect(screen.getByTestId('add-friend-sent')).toBeOnTheScreen();
    expect(screen.getByTestId('add-friend-refresh-failed')).toBeOnTheScreen();
    expect(screen.getByTestId('add-friend-qr')).toBeOnTheScreen();
  });

  it.each([
    ['NOT_SAVED', 'add-friend-guest'],
    ['NOT_SIGNED_IN', 'add-friend-signed-out'],
  ])(
    'a call that gets %s shows that in place of the link, as a load would',
    async (code, shown) => {
      signInSaved();
      meet('ann');
      const sendRequest = jest.fn().mockRejectedValue({ code, message: 'no' });
      await show({ ...onlineFake.friends, sendRequest });
      await setupUser().press(
        screen.getByRole('button', { name: `Ask ${nameOf('ann')} to be friends` }),
      );
      await flush();
      expect(screen.getByTestId(shown)).toBeOnTheScreen();
      expect(screen.queryByTestId('add-friend-qr')).toBeNull();
      expect(screen.queryByTestId('add-friend-problem')).toBeNull();
    },
  );

  it('finds a player by exact username and asks them', async () => {
    signInSaved();
    onlineFake.server().markSaved('ann');
    await onlineFake
      .server()
      .usernamesFor('ann', true)
      .setMine({ name: 'Maria', ...STEP });
    await show();
    const user = setupUser();
    await user.type(screen.getByLabelText('Username'), 'nobody');
    await user.press(screen.getByRole('button', { name: 'Search' }));
    await flush();
    expect(screen.getByTestId('add-friend-not-found')).toBeOnTheScreen();
    await user.clear(screen.getByLabelText('Username'));
    await user.type(screen.getByLabelText('Username'), 'maria');
    await user.press(screen.getByRole('button', { name: 'Search' }));
    await flush();
    expect(screen.getByText('Maria')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Ask Maria to be friends' }));
    await flush();
    expect(screen.getByTestId('add-friend-sent')).toHaveTextContent(
      'Asked Maria. You are friends when they accept.',
    );
    const { incoming } = await onlineFake.server().friendsFor('ann').listRequests();
    expect(incoming.map((r) => r.playerId)).toEqual([ME]);
  });

  it('a pasted friend link opens; other text says it is not one', async () => {
    signInSaved();
    const props = await show();
    const user = setupUser();
    // The paste field shows once its row is open.
    expect(screen.queryByLabelText('Friend link')).toBeNull();
    await user.press(screen.getByTestId('add-friend-paste-row'));
    await user.type(screen.getByLabelText('Friend link'), 'hello');
    await user.press(screen.getByRole('button', { name: 'Open the link' }));
    expect(screen.getByTestId('add-friend-paste-bad')).toBeOnTheScreen();
    expect(props.onLink).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText('Friend link'));
    await user.type(screen.getByLabelText('Friend link'), 'tavlaki://add/abcdefgh23456789');
    await user.press(screen.getByRole('button', { name: 'Open the link' }));
    expect(props.onLink).toHaveBeenCalledWith('ABCDEFGH23456789');
  });

  it('lists recent players: Ask sends a request, and the row then says so', async () => {
    signInSaved();
    meet('ann');
    await show();
    const user = setupUser();
    await user.press(screen.getByRole('button', { name: `Ask ${nameOf('ann')} to be friends` }));
    await flush();
    expect(screen.getByTestId('recent-ann-status')).toHaveTextContent('Asked');
    expect(screen.getByLabelText('You asked. They have not answered yet.')).toBeOnTheScreen();
  });

  it('a refused request says why', async () => {
    signInSaved();
    meet('ann');
    const sendRequest = jest
      .fn()
      .mockRejectedValue({ code: 'TOO_MANY_REQUESTS', message: 'too many' });
    await show({ ...onlineFake.friends, sendRequest });
    await setupUser().press(
      screen.getByRole('button', { name: `Ask ${nameOf('ann')} to be friends` }),
    );
    await flush();
    expect(screen.getByTestId('add-friend-problem')).toHaveTextContent(
      'You have too many open requests. Wait for answers, or cancel one.',
    );
  });
});
