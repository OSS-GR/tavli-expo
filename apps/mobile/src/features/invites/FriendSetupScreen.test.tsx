/**
 * Play a friend online (#281): the choices, "Make an invite" on an
 * in-memory server, the sign-in sheet (#401: Apple, the guest made once,
 * Not now), the analytics events, the errors (no account, no invite, too
 * many invites) and Greek. Your friends on Play a friend, and the last
 * setup of a friend invite (#488).
 */
import {
  createMemoryAppleSheet,
  createMemoryAuthProvider,
  createMemoryAuthStore,
  createRecordingAnalytics,
  type AuthProvider,
  type Friends,
  type Invites,
  type NewInvite,
} from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import { createMemoryGameServer, MAX_OPEN_INVITES, type MemoryGameServer } from '@tavli/online';
import { guestNumberOf } from '@tavli/online/testing';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { forgetOnlineAccount, rememberOnlineAccount } from '@/features/online/accountHint';
import i18n from '@/i18n';
import { storage } from '@/services';

import {
  FRIEND_INVITE_SETUP_KEY,
  loadFriendInviteSetup,
  saveFriendInviteSetup,
} from './friendInviteSetup';
import { FriendSetupScreen } from './FriendSetupScreen';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { enterEmailCode } from '../../../test/emailCode';
import { renderWithRoot } from '../../../test/render';

/** Lets the account check answer (it answers on later microtasks). */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

const START = Date.UTC(2026, 9, 28, 12, 0, 0);

runOnFakeTimers();

afterAll(async () => {
  await i18n.changeLanguage('en');
});

// The note "an online account was used here" stays in storage between tests.
afterEach(() => {
  forgetOnlineAccount();
  storage.remove(FRIEND_INVITE_SETUP_KEY);
});

/** The sign-in and the server, like the app's: each invite call comes from the signed-in user. */
function setup() {
  const authStore = createMemoryAuthStore();
  const auth = createMemoryAuthProvider(authStore);
  const server = createMemoryGameServer({ rng: createSeededRng(5), now: () => START });
  const caller = () => server.invitesFor(auth.currentUser()?.id ?? 'nobody');
  const invites: Invites = {
    createInvite: (game) => caller().createInvite(game),
    getInvite: (code) => caller().getInvite(code),
    watchInvite: (code, onView, onError) => caller().watchInvite(code, onView, onError),
    acceptInvite: (code) => caller().acceptInvite(code),
    declineInvite: (code) => caller().declineInvite(code),
    cancelInvite: (code) => caller().cancelInvite(code),
    listMyInvites: () => caller().listMyInvites(),
    watchMyInvites: (onList, onError) => caller().watchMyInvites(onList, onError),
  };
  const analytics = createRecordingAnalytics();
  analytics.optIn();
  const appleSheet = createMemoryAppleSheet();
  return { auth, authStore, server, invites, analytics, appleSheet };
}

async function open(parts: {
  auth: AuthProvider;
  invites: Invites;
  analytics: ReturnType<typeof createRecordingAnalytics>;
  appleSheet: ReturnType<typeof createMemoryAppleSheet>;
}) {
  const props = { onCreated: jest.fn<void, [string]>(), onBack: jest.fn() };
  const view = await renderWithRoot(<FriendSetupScreen {...parts} {...props} />);
  return { ...props, ...view };
}

describe('FriendSetupScreen', () => {
  it('says an online game needs a free account, and makes no account until "Make an invite"', async () => {
    const parts = setup();
    await open(parts);
    expect(screen.getByRole('header', { name: 'Play a friend online' })).toBeOnTheScreen();
    expect(
      screen.getByText(
        'An online game needs a free account. When you make the invite, you pick how you sign in: you can play as a guest, with no name and no email.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: /^Portes/ })).toBeChecked();
    expect(screen.getByText('First to 1 point')).toBeOnTheScreen();
    expect(screen.getByText('No time limit: 24 hours per turn')).toBeOnTheScreen();
    expect(parts.authStore.guests).toBe(0);
  });

  it('asks how to sign in, makes the guest, then the invite with the choices', async () => {
    const user = setupUser();
    const parts = setup();
    const { onCreated } = await open(parts);
    await user.press(screen.getByRole('radio', { name: /^Plakoto/ }));
    await user.press(screen.getByRole('radio', { name: '5' }));
    expect(screen.getByText('First to 5 points')).toBeOnTheScreen();
    expect(screen.getByText('No time limit: 24 hours per turn')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    expect(await screen.findByRole('header', { name: 'Play online' })).toBeOnTheScreen();
    expect(parts.authStore.guests).toBe(0);
    expect(onCreated).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Continue as a guest' }));
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('sign-in-sheet')).toBeNull();
    const code = onCreated.mock.calls[0]![0];
    expect(parts.authStore.guests).toBe(1);
    expect(parts.server.getInvite(code)).toMatchObject({
      from: 'guest-1',
      choice: 'plakoto',
      targetPoints: 5,
      turnTimeMinutes: null,
      status: 'open',
    });
    expect(parts.analytics.sent).toEqual([
      { type: 'track', event: 'online_sign_in', props: { method: 'guest' } },
      {
        type: 'track',
        event: 'invite_created',
        props: { game: 'plakoto', matchLength: 5, turnTimeMinutes: undefined },
      },
    ]);
    // No code, no user id.
    expect(JSON.stringify(parts.analytics.sent)).not.toContain(code);
    expect(JSON.stringify(parts.analytics.sent)).not.toContain('guest-1');
    // The route opens the waiting screen: the button stays off until then.
    expect(screen.getByRole('button', { name: 'Make an invite' })).toBeDisabled();
  });

  it('makes the guest once: the next invite uses the saved session', async () => {
    const user = setupUser();
    const parts = setup();
    const first = await open(parts);
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    await user.press(await screen.findByRole('button', { name: 'Continue as a guest' }));
    expect(first.onCreated).toHaveBeenCalledTimes(1);
    await first.unmount();

    // The app starts again: a new provider on the same secure store.
    const auth = createMemoryAuthProvider(parts.authStore);
    const second = await open({ ...parts, auth });
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    // A saved session: no sheet.
    expect(screen.queryByTestId('sign-in-sheet')).toBeNull();
    expect(second.onCreated).toHaveBeenCalledTimes(1);
    expect(parts.authStore.guests).toBe(1);
    expect(parts.server.getInvite(second.onCreated.mock.calls[0]![0])?.from).toBe('guest-1');
  });

  it('says so when the account is not made, and makes no invite', async () => {
    const user = setupUser();
    const parts = setup();
    const auth: AuthProvider = {
      ...parts.auth,
      signInAsGuest: () => Promise.reject({ code: 'NETWORK', message: 'offline' }),
    };
    const createInvite = jest.spyOn(parts.invites, 'createInvite');
    const { onCreated } = await open({ ...parts, auth });
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    await user.press(await screen.findByRole('button', { name: 'Continue as a guest' }));
    expect(screen.getByText('No connection')).toBeOnTheScreen();
    expect(createInvite).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(parts.analytics.sent).toEqual([]);
    // OK shows the choices again.
    await user.press(screen.getByRole('button', { name: 'OK' }));
    await user.press(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.getByRole('button', { name: 'Make an invite' })).toBeEnabled();
  });

  it('says so when the saved session does not load, and makes no invite', async () => {
    const user = setupUser();
    const parts = setup();
    const auth: AuthProvider = {
      ...parts.auth,
      ready: () => Promise.reject({ code: 'NETWORK', message: 'offline' }),
    };
    const { onCreated } = await open({ ...parts, auth });
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    expect(
      screen.getByText('Your free account was not made. Check the connection and try again.'),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('sign-in-sheet')).toBeNull();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('Not now closes the sheet and makes nothing', async () => {
    const user = setupUser();
    const parts = setup();
    const createInvite = jest.spyOn(parts.invites, 'createInvite');
    const { onCreated } = await open(parts);
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    await user.press(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByTestId('sign-in-sheet')).toBeNull();
    expect(parts.authStore.session).toBeNull();
    expect(createInvite).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(parts.analytics.sent).toEqual([]);
    expect(screen.getByRole('button', { name: 'Make an invite' })).toBeEnabled();
  });

  it('signs in with Apple, then makes the invite as that user', async () => {
    const user = setupUser();
    const parts = setup();
    const { onCreated } = await open(parts);
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    await user.press(await screen.findByRole('button', { name: 'Continue with Apple' }));
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(parts.server.getInvite(onCreated.mock.calls[0]![0])?.from).toBe('user-1');
    expect(parts.appleSheet.shown).toEqual(['nonce-1']);
    expect(parts.authStore.appleCodes).toEqual(['code-apple-1']);
    expect(parts.authStore.guests).toBe(0);
    expect(parts.analytics.sent[0]).toEqual({
      type: 'track',
      event: 'online_sign_in',
      props: { method: 'apple' },
    });
  });

  it('signs in with an email code in the sheet, then makes the invite as that user (#433)', async () => {
    const user = setupUser();
    const parts = setup();
    const { onCreated } = await open(parts);
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    await user.press(await screen.findByRole('button', { name: 'Continue with email' }));
    expect(screen.getByTestId('sign-in-sheet')).toBeOnTheScreen();
    await enterEmailCode(user, parts.authStore, 'eleni@example.com');
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(parts.server.getInvite(onCreated.mock.calls[0]![0])?.from).toBe('user-1');
    expect(parts.authStore.guests).toBe(0);
    expect(parts.analytics.sent[0]).toEqual({
      type: 'track',
      event: 'online_sign_in',
      props: { method: 'email' },
    });
  });

  it('says so when the server does not make the invite, and the user can try again', async () => {
    const user = setupUser();
    const parts = setup();
    const real = parts.invites.createInvite;
    const createInvite = jest
      .fn<Promise<string>, Parameters<Invites['createInvite']>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(real);
    const { onCreated } = await open({ ...parts, invites: { ...parts.invites, createInvite } });
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    await user.press(await screen.findByRole('button', { name: 'Continue as a guest' }));
    expect(
      screen.getByText('The invite was not made. Check the connection and try again.'),
    ).toBeOnTheScreen();
    expect(onCreated).not.toHaveBeenCalled();
    expect(parts.analytics.sent).toEqual([
      { type: 'track', event: 'online_sign_in', props: { method: 'guest' } },
    ]);

    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText('The invite was not made. Check the connection and try again.'),
    ).toBeNull();
    // Still one guest.
    expect(parts.authStore.guests).toBe(1);
  });

  it('says how many open invites a player may have, on TOO_MANY_INVITES (#275)', async () => {
    const user = setupUser();
    const parts = setup();
    await parts.auth.signInAsGuest();
    for (let i = 0; i < MAX_OPEN_INVITES; i += 1) {
      parts.server.createInvite('guest-1', 'portes', 1, 1);
    }
    const { onCreated } = await open(parts);
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    expect(
      screen.getByText(
        'You have 10 open invites. Wait until a friend answers one, or until one expires, then make a new one.',
      ),
    ).toBeOnTheScreen();
    expect(onCreated).not.toHaveBeenCalled();
    expect(parts.analytics.sent).toEqual([]);

    await act(async () => {
      await i18n.changeLanguage('el');
    });
    expect(
      screen.getByText(
        'Έχεις 10 ανοιχτές προσκλήσεις. Περίμενε να απαντήσει ένας φίλος ή να λήξει μία, και μετά φτιάξε καινούργια.',
      ),
    ).toBeOnTheScreen();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('a friend invite (#406) goes to that friend, with its own title', async () => {
    const user = setupUser();
    const parts = setup();
    // A friend invite needs a saved account.
    parts.authStore.session = { id: 'saved-1', isGuest: false };
    rememberOnlineAccount();
    const invite = jest.fn<Promise<string>, [NewInvite]>().mockResolvedValue('ABCD2345');
    const props = { onCreated: jest.fn<void, [string]>(), onBack: jest.fn() };
    await renderWithRoot(<FriendSetupScreen {...parts} {...props} friend={{ invite }} />);
    expect(screen.getByRole('header', { name: 'Invite a friend' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    expect(invite).toHaveBeenCalledWith({
      choice: 'portes',
      targetPoints: 1,
      turnTimeMinutes: null,
    });
    expect(props.onCreated).toHaveBeenCalledWith('ABCD2345', expect.anything());
    expect(await parts.invites.listMyInvites()).toEqual([]);
  });

  it('a friend invite says so on TOO_MANY_INVITES from the friends port (#406)', async () => {
    const user = setupUser();
    const parts = setup();
    parts.authStore.session = { id: 'saved-1', isGuest: false };
    rememberOnlineAccount();
    const invite = jest.fn().mockRejectedValue({ code: 'TOO_MANY_INVITES', message: 'too many' });
    const props = { onCreated: jest.fn<void, [string]>(), onBack: jest.fn() };
    await renderWithRoot(<FriendSetupScreen {...parts} {...props} friend={{ invite }} />);
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    expect(screen.getByTestId('friend-problem')).toHaveTextContent(/You have 10 open invites/);
    expect(props.onCreated).not.toHaveBeenCalled();
  });

  it('a friend invite as a guest says it needs a saved account when it opens (#406)', async () => {
    const user = setupUser();
    const parts = setup();
    await parts.auth.signInAsGuest();
    rememberOnlineAccount();
    const invite = jest.fn<Promise<string>, [NewInvite]>().mockResolvedValue('ABCD2345');
    const onAccount = jest.fn();
    const props = { onCreated: jest.fn<void, [string]>(), onBack: jest.fn() };
    await renderWithRoot(
      <FriendSetupScreen {...parts} {...props} friend={{ invite }} onAccount={onAccount} />,
    );
    await flush();
    // No tap needed: the screen says so as it opens, in place of Make an invite.
    expect(screen.getByTestId('friend-not-saved')).toHaveTextContent(
      'Friends need a saved account. Save your guest account first: your games stay.',
    );
    expect(screen.queryByTestId('friend-make')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Save my account' }));
    expect(onAccount).toHaveBeenCalledTimes(1);
    expect(invite).not.toHaveBeenCalled();
  });

  it('a friend invite checks the account again on a new visit (#406)', async () => {
    const parts = setup();
    await parts.auth.signInAsGuest();
    rememberOnlineAccount();
    const invite = jest.fn<Promise<string>, [NewInvite]>().mockResolvedValue('ABCD2345');
    const props = { onCreated: jest.fn<void, [string]>(), onBack: jest.fn(), onAccount: jest.fn() };
    const ui = (visit: number) => (
      <FriendSetupScreen {...parts} {...props} friend={{ invite }} visit={visit} />
    );
    await renderWithRoot(ui(1));
    await flush();
    expect(screen.getByTestId('friend-not-saved')).toBeOnTheScreen();
    // Back from Account with a saved account.
    parts.authStore.session = { id: 'saved-1', isGuest: false };
    await screen.rerender(ui(2));
    await flush();
    expect(screen.queryByTestId('friend-not-saved')).toBeNull();
    expect(screen.getByTestId('friend-make')).toBeOnTheScreen();
  });

  it('a friend invite with nobody signed in makes no guest and offers Account (#406)', async () => {
    const parts = setup();
    const invite = jest.fn<Promise<string>, [NewInvite]>().mockResolvedValue('ABCD2345');
    const props = { onCreated: jest.fn<void, [string]>(), onBack: jest.fn(), onAccount: jest.fn() };
    await renderWithRoot(<FriendSetupScreen {...parts} {...props} friend={{ invite }} />);
    await flush();
    expect(screen.queryByTestId('sign-in-sheet')).toBeNull();
    expect(screen.getByTestId('friend-not-saved')).toHaveTextContent(
      'You are not signed in to online play on this phone. Friends need a saved account.',
    );
    expect(screen.getByRole('button', { name: 'Open Account' })).toBeOnTheScreen();
    expect(parts.authStore.guests).toBe(0);
    expect(invite).not.toHaveBeenCalled();
  });

  it('a friend invite with no account note on this phone asks no server (#406)', async () => {
    const parts = setup();
    const ready = jest.spyOn(parts.auth, 'ready');
    const invite = jest.fn<Promise<string>, [NewInvite]>().mockResolvedValue('ABCD2345');
    const props = { onCreated: jest.fn<void, [string]>(), onBack: jest.fn(), onAccount: jest.fn() };
    await renderWithRoot(<FriendSetupScreen {...parts} {...props} friend={{ invite }} />);
    await flush();
    expect(ready).not.toHaveBeenCalled();
    expect(screen.getByTestId('friend-not-saved')).toHaveTextContent(/You are not signed in/);
  });

  it('a friend invite whose account check fails shows Make an invite again (#406)', async () => {
    const parts = setup();
    await parts.auth.signInAsGuest();
    rememberOnlineAccount();
    const invite = jest.fn<Promise<string>, [NewInvite]>().mockResolvedValue('ABCD2345');
    const props = { onCreated: jest.fn<void, [string]>(), onBack: jest.fn(), onAccount: jest.fn() };
    const ui = (visit: number) => (
      <FriendSetupScreen {...parts} {...props} friend={{ invite }} visit={visit} />
    );
    await renderWithRoot(ui(1));
    await flush();
    expect(screen.getByTestId('friend-not-saved')).toBeOnTheScreen();
    // Back from Account, offline: the check fails. The old answer may be
    // wrong now, so the player gets Make an invite, which checks again.
    jest.spyOn(parts.auth, 'ready').mockRejectedValueOnce(new Error('offline'));
    await screen.rerender(ui(2));
    await flush();
    expect(screen.queryByTestId('friend-not-saved')).toBeNull();
    expect(screen.getByTestId('friend-make')).toBeOnTheScreen();
  });

  it('a friend invite drops an older account answer after a newer one (#406)', async () => {
    const user = setupUser();
    const parts = setup();
    parts.authStore.session = { id: 'saved-1', isGuest: false };
    rememberOnlineAccount();
    // Make an invite's check waits until the test lets it answer "a guest".
    const real = parts.auth.ready.bind(parts.auth);
    let answer: (() => void) | null = null;
    const ready = jest.spyOn(parts.auth, 'ready');
    const invite = jest.fn<Promise<string>, [NewInvite]>().mockResolvedValue('ABCD2345');
    const props = { onCreated: jest.fn<void, [string]>(), onBack: jest.fn(), onAccount: jest.fn() };
    const ui = (visit: number) => (
      <FriendSetupScreen {...parts} {...props} friend={{ invite }} visit={visit} />
    );
    await renderWithRoot(ui(1));
    await flush();
    ready.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = () => resolve({ id: 'saved-1', isGuest: true });
        }),
    );
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    expect(answer).not.toBeNull();
    // The player comes back to the screen: a newer check says saved.
    ready.mockImplementation(real);
    await screen.rerender(ui(2));
    await flush();
    // The older answer comes last: it must not bring the block back.
    await act(async () => answer?.());
    await flush();
    expect(screen.queryByTestId('friend-not-saved')).toBeNull();
    expect(screen.getByTestId('friend-make')).toBeEnabled();
    expect(invite).not.toHaveBeenCalled();
  });

  it('a friend invite says it needs a saved account on NOT_SAVED from the server (#406)', async () => {
    const user = setupUser();
    const parts = setup();
    parts.authStore.session = { id: 'saved-1', isGuest: false };
    rememberOnlineAccount();
    const invite = jest.fn().mockRejectedValue({ code: 'NOT_SAVED', message: 'not saved' });
    const props = { onCreated: jest.fn<void, [string]>(), onBack: jest.fn() };
    await renderWithRoot(<FriendSetupScreen {...parts} {...props} friend={{ invite }} />);
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    expect(screen.getByTestId('friend-not-saved')).toHaveTextContent(
      /Friends need a saved account/,
    );
  });

  it('a second tap while the invite is made makes no second invite', async () => {
    const parts = setup();
    await parts.auth.signInAsGuest();
    const createInvite = jest.spyOn(parts.invites, 'createInvite');
    const { onCreated } = await open(parts);
    const button = screen.getByRole('button', { name: 'Make an invite' });
    // Two taps in the same frame: the second comes before a render.
    await act(async () => {
      fireEvent.press(button);
      fireEvent.press(button);
    });
    expect(createInvite).toHaveBeenCalledTimes(1);
    expect(onCreated).toHaveBeenCalledTimes(1);
    expect(parts.authStore.guests).toBe(1);
  });

  it('Back while the invite is made: the new invite is cancelled, not left open', async () => {
    const user = setupUser();
    const parts = setup();
    await parts.auth.signInAsGuest();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const real = parts.invites.createInvite;
    const invites: Invites = {
      ...parts.invites,
      createInvite: async (game) => {
        const code = await real(game);
        await held;
        return code;
      },
    };
    const view = await open({ ...parts, invites });
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    await view.unmount();
    await act(async () => release());
    await act(async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
    const mine = await parts.server.invitesFor('guest-1').listMyInvites();
    expect(mine).toEqual([]);
    expect(view.onCreated).not.toHaveBeenCalled();
    expect(parts.analytics.sent).toEqual([]);
  });

  it('Back before the account is ready makes no invite', async () => {
    const user = setupUser();
    const parts = setup();
    await parts.auth.signInAsGuest();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const auth: AuthProvider = {
      ...parts.auth,
      ready: async () => {
        await held;
        return parts.auth.ready();
      },
    };
    const createInvite = jest.spyOn(parts.invites, 'createInvite');
    const view = await open({ ...parts, auth });
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    await view.unmount();
    await act(async () => release());
    await act(async () => {
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });
    expect(createInvite).not.toHaveBeenCalled();
  });

  it('screen readers: a problem is read out (iOS does not read alert roles)', async () => {
    const user = setupUser();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const parts = setup();
    await parts.auth.signInAsGuest();
    const createInvite = jest
      .fn<Promise<string>, Parameters<Invites['createInvite']>>()
      .mockRejectedValue(new Error('offline'));
    await open({ ...parts, invites: { ...parts.invites, createInvite } });
    const text = 'The invite was not made. Check the connection and try again.';
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    expect(announce).toHaveBeenLastCalledWith(text);
    // The same problem again is read again.
    announce.mockClear();
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    expect(announce).toHaveBeenCalledWith(text);
    expect(announce).toHaveBeenCalledTimes(1);
    announce.mockRestore();
  });

  it('screen readers: focus moves to the title', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    await open(setup());
    await screen.findByRole('header', { name: 'Play a friend online' });
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
    focus.mockRestore();
  });

  it('goes back with the back button', async () => {
    const user = setupUser();
    const { onBack } = await open(setup());
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await open(setup());
    expect(screen.getByRole('header', { name: 'Παίξε με φίλο online' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Φτιάξε πρόσκληση' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Χωρίς' })).toBeOnTheScreen();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });
});

describe('FriendSetupScreen: your friends (#488)', () => {
  const ME = 'me';

  /** A saved me, with a note of the account on this phone. */
  function savedMe() {
    const parts = setup();
    parts.authStore.session = { id: ME, isGuest: false };
    parts.server.markSaved(ME);
    rememberOnlineAccount();
    // The friends port as me, like the app's (the session is set first).
    const friends: Friends = parts.server.friendsFor(ME);
    return { ...parts, friends };
  }

  /** `id` and I meet in a game (so each of us has a name), then become friends. */
  async function befriend(server: MemoryGameServer, id: string): Promise<void> {
    server.markSaved(id);
    server.createGame(ME, { white: ME, black: id }, 'portes', 3, null);
    await server.friendsFor(id).sendRequest(ME);
    await server.friendsFor(ME).acceptRequest(id);
  }

  const nameOf = (server: MemoryGameServer, id: string) => `Guest ${guestNumberOf(server, id)}`;

  async function show(
    parts: ReturnType<typeof savedMe>,
    extra: { friends?: Friends; onFriends?: () => void } = {},
  ) {
    const props = { onCreated: jest.fn<void, [string, NewInvite]>(), onBack: jest.fn() };
    await renderWithRoot(
      <FriendSetupScreen {...parts} {...props} friends={parts.friends} {...extra} />,
    );
    await flush();
    return props;
  }

  it('lists my friends with the record above Make an invite', async () => {
    const parts = savedMe();
    await befriend(parts.server, 'ann');
    await show(parts);
    expect(screen.getByTestId('friend-friends')).toBeOnTheScreen();
    expect(screen.getByText(nameOf(parts.server, 'ann'))).toBeOnTheScreen();
    expect(screen.getByText('Matches: you won 0, they won 0')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Make an invite' })).toBeOnTheScreen();
  });

  it('a tap on a friend sends a friend invite with the picks at once, and saves them', async () => {
    const user = setupUser();
    const parts = savedMe();
    await befriend(parts.server, 'ann');
    const props = await show(parts);
    await user.press(screen.getByRole('radio', { name: /^Fevga/ }));
    await user.press(screen.getByRole('radio', { name: '3' }));
    await user.press(screen.getByRole('radio', { name: '5 min' }));
    await user.press(
      screen.getByRole('button', { name: `Send the invite to ${nameOf(parts.server, 'ann')}` }),
    );
    await flush();
    const game = { choice: 'fevga', targetPoints: 3, turnTimeMinutes: 5 };
    expect(props.onCreated).toHaveBeenCalledWith(expect.any(String), game);
    const code = props.onCreated.mock.calls[0]![0];
    expect(await parts.server.friendsFor('ann').listFriendInvites()).toEqual([
      expect.objectContaining({ code, from: ME, ...game }),
    ]);
    // No code invite on the side, and no sign-in sheet.
    expect(screen.queryByTestId('sign-in-sheet')).toBeNull();
    expect(loadFriendInviteSetup()).toEqual(game);
    expect(parts.analytics.sent).toEqual([
      {
        type: 'track',
        event: 'invite_created',
        props: { game: 'fevga', matchLength: 3, turnTimeMinutes: 5 },
      },
    ]);
  });

  it('a code invite (Make an invite) saves no friend setup', async () => {
    const user = setupUser();
    const parts = savedMe();
    await befriend(parts.server, 'ann');
    const props = await show(parts);
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    await flush();
    expect(props.onCreated).toHaveBeenCalledTimes(1);
    expect(loadFriendInviteSetup()).toBeNull();
  });

  it('shows five friends, and All your friends when there are more', async () => {
    const user = setupUser();
    const parts = savedMe();
    for (const id of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']) await befriend(parts.server, id);
    const onFriends = jest.fn();
    await show(parts, { onFriends });
    const rows = screen.getAllByTestId(/^friend-pick-/);
    expect(rows).toHaveLength(5);
    await user.press(screen.getByRole('button', { name: 'All your friends' }));
    expect(onFriends).toHaveBeenCalledTimes(1);
  });

  it('a saved account with no friends sees the screen as before', async () => {
    const parts = savedMe();
    await show(parts);
    expect(screen.queryByTestId('friend-friends')).toBeNull();
    expect(screen.getByRole('button', { name: 'Make an invite' })).toBeOnTheScreen();
  });

  it('a guest sees no list, and the friends port is not asked', async () => {
    const parts = setup();
    await parts.auth.signInAsGuest();
    rememberOnlineAccount();
    const listFriends = jest.fn();
    const friends = { ...parts.server.friendsFor('guest-1'), listFriends } as Friends;
    await show({ ...parts, friends });
    expect(listFriends).not.toHaveBeenCalled();
    expect(screen.queryByTestId('friend-friends')).toBeNull();
    expect(screen.queryByTestId('friend-not-saved')).toBeNull();
  });

  it('with no account note on this phone, asks no server and makes no account', async () => {
    const parts = setup();
    const ready = jest.spyOn(parts.auth, 'ready');
    const listFriends = jest.fn();
    const friends = { ...parts.server.friendsFor(null), listFriends } as Friends;
    await show({ ...parts, friends });
    expect(ready).not.toHaveBeenCalled();
    expect(listFriends).not.toHaveBeenCalled();
    expect(parts.authStore.guests).toBe(0);
    expect(screen.queryByTestId('friend-friends')).toBeNull();
  });

  it('a failed load shows no list, and Make an invite still works', async () => {
    const parts = savedMe();
    await befriend(parts.server, 'ann');
    const friends = {
      ...parts.friends,
      listFriends: jest.fn().mockRejectedValue(new Error('offline')),
    } as Friends;
    await show({ ...parts, friends });
    expect(screen.queryByTestId('friend-friends')).toBeNull();
    expect(screen.getByRole('button', { name: 'Make an invite' })).toBeEnabled();
  });

  it('a friend who is gone says so, and the list loads again without them', async () => {
    const user = setupUser();
    const parts = savedMe();
    await befriend(parts.server, 'ann');
    await befriend(parts.server, 'bob');
    const props = await show(parts);
    // Ann ends the friendship on her phone.
    await parts.server.friendsFor('ann').removeFriend(ME);
    await user.press(
      screen.getByRole('button', { name: `Send the invite to ${nameOf(parts.server, 'ann')}` }),
    );
    await flush();
    expect(screen.getByTestId('friend-problem')).toHaveTextContent('You are not friends any more.');
    expect(screen.queryByText(nameOf(parts.server, 'ann'))).toBeNull();
    expect(screen.getByText(nameOf(parts.server, 'bob'))).toBeOnTheScreen();
    expect(props.onCreated).not.toHaveBeenCalled();
  });

  it('a tap that finds the account gone drops the list and opens no sign-in sheet', async () => {
    const user = setupUser();
    const parts = savedMe();
    await befriend(parts.server, 'ann');
    const props = await show(parts);
    parts.authStore.session = null;
    await user.press(
      screen.getByRole('button', { name: `Send the invite to ${nameOf(parts.server, 'ann')}` }),
    );
    await flush();
    expect(screen.queryByTestId('friend-friends')).toBeNull();
    expect(screen.queryByTestId('sign-in-sheet')).toBeNull();
    expect(screen.getByTestId('friend-problem')).toHaveTextContent(/not signed in any more/);
    expect(props.onCreated).not.toHaveBeenCalled();
  });

  it('a friend invite (#406) starts from the last setup', async () => {
    const parts = savedMe();
    saveFriendInviteSetup({ choice: 'asodio', targetPoints: 5, turnTimeMinutes: 1 });
    const invite = jest.fn<Promise<string>, [NewInvite]>().mockResolvedValue('ABCD2345');
    const props = { onCreated: jest.fn<void, [string]>(), onBack: jest.fn() };
    await renderWithRoot(<FriendSetupScreen {...parts} {...props} friend={{ invite }} />);
    await flush();
    expect(screen.getByRole('radio', { name: /^Asodio/ })).toBeChecked();
    expect(screen.getByText('First to 5 points')).toBeOnTheScreen();
    expect(screen.getByText('1 minute per turn')).toBeOnTheScreen();
    // The friend-invite screen shows no friends list.
    expect(screen.queryByTestId('friend-friends')).toBeNull();
  });
});
