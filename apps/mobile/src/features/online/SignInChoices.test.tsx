/**
 * The username step after a sign-in with Apple (#405): a saved account
 * with no username sees `UsernameForm` in place of the choices; a guest,
 * an account with a name, and a server that cannot say go on at once.
 */
import {
  TERMS_VERSION,
  createMemoryAppleSheet,
  createMemoryAuthProvider,
  createMemoryAuthStore,
  createRecordingAnalytics,
  type AuthProvider,
  type AuthUser,
  type Usernames,
} from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import { createMemoryGameServer, type MemoryGameServer } from '@tavli/online';
import { screen, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { renderWithRoot } from '../../../test/render';

import { SignInChoices } from './SignInChoices';

runOnFakeTimers();

const STEP = { acceptTerms: TERMS_VERSION, ageChecked: true } as const;

let server: MemoryGameServer;
let auth: AuthProvider;
let store: ReturnType<typeof createMemoryAuthStore>;

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  server = createMemoryGameServer({ rng: createSeededRng(1), now: () => Date.UTC(2026, 10, 9) });
  store = createMemoryAuthStore();
  auth = createMemoryAuthProvider(store);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/** The server as the user Apple signs in (`user-1`, a saved account). */
function savedUsernames(): Usernames {
  return server.usernamesFor('user-1', true);
}

async function open(usernames: Usernames | undefined) {
  const onSignedIn = jest.fn<void, [AuthUser]>();
  const onNotNow = jest.fn();
  const analytics = createRecordingAnalytics();
  await renderWithRoot(
    <SignInChoices
      auth={auth}
      onSignedIn={onSignedIn}
      onNotNow={onNotNow}
      appleSheet={createMemoryAppleSheet()}
      analytics={analytics}
      usernames={usernames}
    />,
  );
  return { onSignedIn, onNotNow };
}

describe('the username step after a sign-in', () => {
  it('asks a new saved account for a name, the terms and the age, then goes on', async () => {
    const user = setupUser();
    const { onSignedIn } = await open(savedUsernames());
    await user.press(await screen.findByRole('button', { name: 'Continue with Apple' }));
    expect(await screen.findByRole('header', { name: 'Pick a username' })).toBeOnTheScreen();
    expect(onSignedIn).not.toHaveBeenCalled();

    const save = screen.getByRole('button', { name: 'Save' });
    await user.type(screen.getByTestId('username-input'), 'Νίκος');
    expect(save).toBeDisabled();
    await user.press(screen.getByRole('switch', { name: 'I accept the terms of use' }));
    expect(save).toBeDisabled();
    // The phone has no region in Jest: 16.
    await user.press(screen.getByRole('switch', { name: 'I am 16 or older' }));
    expect(save).toBeEnabled();
    await user.press(save);

    expect(onSignedIn).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }));
    expect(server.nameOf('user-1')).toEqual({ kind: 'username', name: 'Νίκος' });
  });

  it('Not now goes on with no name', async () => {
    const user = setupUser();
    const { onSignedIn, onNotNow } = await open(savedUsernames());
    await user.press(await screen.findByRole('button', { name: 'Continue with Apple' }));
    await user.press(await screen.findByRole('button', { name: 'Not now' }));
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(onNotNow).not.toHaveBeenCalled();
    expect(server.nameOf('user-1')).toBeNull();
  });

  it('says when another player has the name, and keeps the form', async () => {
    const user = setupUser();
    await server.usernamesFor('someone', true).setMine({ name: 'Maria', ...STEP });
    const { onSignedIn } = await open(savedUsernames());
    await user.press(await screen.findByRole('button', { name: 'Continue with Apple' }));
    await user.type(await screen.findByTestId('username-input'), 'MARÍA');
    await user.press(screen.getByRole('switch', { name: 'I accept the terms of use' }));
    await user.press(screen.getByRole('switch', { name: 'I am 16 or older' }));
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Another player has this name. Try another one.'),
    ).toBeOnTheScreen();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('a guest goes on at once', async () => {
    const user = setupUser();
    const { onSignedIn } = await open(server.usernamesFor('guest-1', false));
    await user.press(screen.getByRole('button', { name: 'Continue as a guest' }));
    expect(onSignedIn).toHaveBeenCalledWith(expect.objectContaining({ isGuest: true }));
    expect(screen.queryByTestId('username-form')).toBeNull();
  });

  it('an account that has a name goes on at once', async () => {
    const user = setupUser();
    await savedUsernames().setMine({ name: 'Alex', ...STEP });
    const { onSignedIn } = await open(savedUsernames());
    await user.press(await screen.findByRole('button', { name: 'Continue with Apple' }));
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('username-form')).toBeNull();
  });

  it('goes on at once when the server cannot say', async () => {
    const user = setupUser();
    const failing: Usernames = {
      mine: () => Promise.reject(new Error('offline')),
      setMine: () => Promise.reject(new Error('offline')),
    };
    const { onSignedIn } = await open(failing);
    await user.press(await screen.findByRole('button', { name: 'Continue with Apple' }));
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('username-form')).toBeNull();
  });
});

describe('what a saved account gives (#463)', () => {
  it('shows the four rows, the sample friend record and what a guest lacks', async () => {
    await open(undefined);
    const benefits = within(screen.getByTestId('sign-in-benefits'));
    expect(benefits.getByRole('header', { name: 'A saved account gives you' })).toBeOnTheScreen();
    for (const title of [
      'Your own username',
      'Your record with each friend',
      'Invites in one tap',
      'Your games on any phone',
    ]) {
      expect(benefits.getByLabelText(new RegExp(`^${title}\\. `))).toBeOnTheScreen();
    }
    expect(screen.getByTestId('sign-in-benefits-sample')).toHaveAccessibleName(
      'Example: your record with Eleni. You won 5, they won 3.',
    );
    expect(
      screen.getByText('A guest plays on this phone only, with no friends list.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/leaderboard|coming soon/i)).toBeNull();
  });
});

describe('a failed sign-in (#462)', () => {
  it('shows the problem box in place of the choices; OK shows them again', async () => {
    const user = setupUser();
    store.offKeys.push('apple');
    const { onSignedIn } = await open(undefined);
    await user.press(await screen.findByRole('button', { name: 'Continue with Apple' }));
    const problem = within(await screen.findByTestId('sign-in-failed'));
    expect(
      problem.getByRole('header', { name: 'Sign in with Apple is not ready' }),
    ).toBeOnTheScreen();
    expect(
      problem.getByText(
        'It is off on our server for now. Try email or a guest account, or try again later.',
      ),
    ).toBeOnTheScreen();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Sign in with Apple is not ready. It is off on our server for now. Try email or a guest account, or try again later.',
    );
    expect(screen.queryByTestId('sign-in-choices')).toBeNull();
    expect(onSignedIn).not.toHaveBeenCalled();
    await user.press(problem.getByRole('button', { name: 'OK' }));
    expect(screen.getByTestId('sign-in-choices')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Continue as a guest' }));
    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });
});
