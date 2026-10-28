/**
 * Play a friend online (#281): the choices, "Make an invite" on an
 * in-memory server, the guest account (made once), the analytics event,
 * the errors (no account, no invite, too many invites) and Greek.
 */
import {
  createMemoryAuthProvider,
  createMemoryAuthStore,
  createRecordingAnalytics,
  type AuthProvider,
  type Invites,
} from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import { createMemoryGameServer, MAX_OPEN_INVITES } from '@tavli/online';
import { act, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import i18n from '@/i18n';

import { FriendSetupScreen } from './FriendSetupScreen';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { renderWithRoot } from '../../../test/render';

const START = Date.UTC(2026, 9, 28, 12, 0, 0);

runOnFakeTimers();

afterAll(async () => {
  await i18n.changeLanguage('en');
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
  };
  const analytics = createRecordingAnalytics();
  analytics.optIn();
  return { auth, authStore, server, invites, analytics };
}

async function open(parts: {
  auth: AuthProvider;
  invites: Invites;
  analytics: ReturnType<typeof createRecordingAnalytics>;
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
        'An online game needs a free account. We make a guest account for you, with no name and no email.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: /^Portes/ })).toBeChecked();
    expect(screen.getByText('First to 3 points')).toBeOnTheScreen();
    expect(screen.getByText('Live · 1 minute per turn')).toBeOnTheScreen();
    expect(parts.authStore.guests).toBe(0);
  });

  it('makes the guest, then the invite with the choices, and sends invite_created', async () => {
    const user = setupUser();
    const parts = setup();
    const { onCreated } = await open(parts);
    await user.press(screen.getByRole('radio', { name: /^Plakoto/ }));
    await user.press(screen.getByRole('radio', { name: '5' }));
    await user.press(screen.getByRole('radio', { name: 'Async' }));
    expect(screen.getByText('First to 5 points')).toBeOnTheScreen();
    expect(screen.getByText('Async · 24 hours per turn')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
    expect(onCreated).toHaveBeenCalledTimes(1);
    const code = onCreated.mock.calls[0]![0];
    expect(parts.authStore.guests).toBe(1);
    expect(parts.server.getInvite(code)).toMatchObject({
      from: 'guest-1',
      choice: 'plakoto',
      targetPoints: 5,
      pace: 'async',
      status: 'open',
    });
    expect(parts.analytics.sent).toEqual([
      {
        type: 'track',
        event: 'invite_created',
        props: { game: 'plakoto', matchLength: 5, pace: 'async' },
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
    expect(first.onCreated).toHaveBeenCalledTimes(1);
    await first.unmount();

    // The app starts again: a new provider on the same secure store.
    const auth = createMemoryAuthProvider(parts.authStore);
    const second = await open({ ...parts, auth });
    await user.press(screen.getByRole('button', { name: 'Make an invite' }));
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
    expect(
      screen.getByText('Your free account was not made. Check the connection and try again.'),
    ).toBeOnTheScreen();
    expect(createInvite).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
    expect(parts.analytics.sent).toEqual([]);
    expect(screen.getByRole('button', { name: 'Make an invite' })).toBeEnabled();
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
    expect(
      screen.getByText('The invite was not made. Check the connection and try again.'),
    ).toBeOnTheScreen();
    expect(onCreated).not.toHaveBeenCalled();
    expect(parts.analytics.sent).toEqual([]);

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
      parts.server.createInvite('guest-1', 'portes', 1, 'live');
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
    expect(screen.getByRole('radio', { name: 'Χαλαρά' })).toBeOnTheScreen();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });
});
