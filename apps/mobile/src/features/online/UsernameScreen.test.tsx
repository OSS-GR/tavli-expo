/**
 * Settings → Username (#405) on the Jest online fake: `auth` and
 * `usernames` act as the signed-in user of one in-memory server.
 */
import { TERMS_VERSION } from '@tavli/contracts';
import { screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { auth, usernames } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { onlineFake } from '../../../test/onlineFake';
import { renderWithRoot } from '../../../test/render';

import { signInForOnline } from './account';
import { rememberOnlineAccount } from './accountHint';
import { signInWithApple } from './signIn';
import { UsernameScreen } from './UsernameScreen';

runOnFakeTimers();

const STEP = { acceptTerms: TERMS_VERSION, ageChecked: true } as const;

let announce: jest.SpyInstance;

beforeEach(() => {
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function openScreen() {
  const onBack = jest.fn();
  await renderWithRoot(<UsernameScreen auth={auth!} usernames={usernames!} onBack={onBack} />);
  return { onBack };
}

/** Signs in a saved account (Apple) and returns its id. */
async function signInSaved(): Promise<string> {
  const user = await signInWithApple(auth!, onlineFake.appleSheet);
  return user!.id;
}

describe('Settings → Username', () => {
  it('a guest reads that a username needs a saved account', async () => {
    await signInForOnline(auth!);
    await openScreen();
    expect(await screen.findByTestId('username-guest-only')).toBeOnTheScreen();
    expect(screen.queryByTestId('username-form')).toBeNull();
  });

  it('a phone with no session reads the same, and makes no account', async () => {
    await openScreen();
    expect(await screen.findByTestId('username-guest-only')).toBeOnTheScreen();
    expect(await auth!.ready()).toBeNull();
  });

  it('picks a name, changes it once, then waits 30 days', async () => {
    const user = setupUser();
    const id = await signInSaved();
    await openScreen();
    const input = await screen.findByTestId('username-input');

    // The phone checks the rules first: "too short" waits for Save.
    await user.type(input, 'ab');
    expect(screen.queryByTestId('username-problem')).toBeNull();
    await user.press(screen.getByRole('switch', { name: 'I accept the terms of use' }));
    await user.press(screen.getByRole('switch', { name: 'I am 16 or older' }));
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Too short: use at least 3 characters.')).toBeOnTheScreen();
    expect(announce).toHaveBeenLastCalledWith('Too short: use at least 3 characters.');
    await user.type(input, 'c Nikos');
    expect(screen.getByText('Use only letters, digits and _.')).toBeOnTheScreen();

    await user.clear(input);
    await user.type(input, 'Admin');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('This name is not allowed. Try another one.')).toBeOnTheScreen();

    await user.clear(input);
    await user.type(input, 'Nikos');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByTestId('username-saved')).toBeOnTheScreen();
    expect(onlineFake.server().nameOf(id)).toEqual({ kind: 'username', name: 'Nikos' });
    // The terms and the age are asked once.
    expect(screen.queryByTestId('username-terms')).toBeNull();
    expect(screen.queryByTestId('username-age')).toBeNull();
    expect(
      screen.getByText('After a change, the next one is possible in 30 days.'),
    ).toBeOnTheScreen();

    const changed = screen.getByTestId('username-input');
    await user.clear(changed);
    await user.type(changed, 'Nikos_7');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/You can change it again on/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(onlineFake.server().nameOf(id)).toEqual({ kind: 'username', name: 'Nikos_7' });
  });

  it('says when another player has the name', async () => {
    const user = setupUser();
    await onlineFake
      .server()
      .usernamesFor('someone', true)
      .setMine({ name: 'Maria', ...STEP });
    await signInSaved();
    await openScreen();
    await user.type(await screen.findByTestId('username-input'), 'maria');
    await user.press(screen.getByRole('switch', { name: 'I accept the terms of use' }));
    await user.press(screen.getByRole('switch', { name: 'I am 16 or older' }));
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText('Another player has this name. Try another one.'),
    ).toBeOnTheScreen();
  });

  it('Back goes back', async () => {
    const user = setupUser();
    await signInForOnline(auth!);
    const { onBack } = await openScreen();
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('the Username row of Settings', () => {
  it('is hidden on a phone that never played online', async () => {
    await renderWithRoot(<SettingsScreen onUsername={jest.fn()} />);
    expect(screen.queryByTestId('settings-username')).toBeNull();
  });

  it('is hidden in a build with no online play', async () => {
    rememberOnlineAccount();
    await renderWithRoot(<SettingsScreen />);
    expect(screen.queryByTestId('settings-username')).toBeNull();
  });

  it('opens the screen after this phone played online', async () => {
    const user = setupUser();
    const onUsername = jest.fn();
    rememberOnlineAccount();
    await renderWithRoot(<SettingsScreen onUsername={onUsername} />);
    await user.press(screen.getByRole('button', { name: 'Username' }));
    expect(onUsername).toHaveBeenCalledTimes(1);
  });
});
