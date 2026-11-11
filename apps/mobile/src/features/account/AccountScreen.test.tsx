/**
 * Settings → Account (#402), on the Jest online fake: one in-memory
 * server, `auth`, `usernames` and `onlineData` as the signed-in user, and
 * Apple's sheet on the phone (`onlineFake.appleSheet`).
 */
import {
  TERMS_VERSION,
  createRecordingAnalytics,
  memoryAppleIdToken,
  type AuthProvider,
} from '@tavli/contracts';
import { act, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { signInForOnline } from '@/features/online/account';
import { hasOnlineAccount, rememberOnlineAccount } from '@/features/online/accountHint';
import { DELETE_TIME_LIMIT_MS } from '@/features/online/deleteData';
import { reminders } from '@/features/reminders/reminders';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import i18n from '@/i18n';
import { appleSheet, auth, onlineData, usernames } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { enterEmailCode } from '../../../test/emailCode';
import { onlineFake } from '../../../test/onlineFake';
import { renderWithRoot } from '../../../test/render';

import { AccountScreen } from './AccountScreen';
import { addableKeys, type AccountDeps } from './useAccount';

runOnFakeTimers();

const GAME = { choice: 'portes', targetPoints: 3, turnTimeMinutes: null } as const;

let announce: jest.SpyInstance;

beforeEach(() => {
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
});

afterEach(async () => {
  jest.restoreAllMocks();
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

async function open(deps: Partial<AccountDeps> = {}) {
  const analytics = createRecordingAnalytics();
  analytics.optIn();
  const onBack = jest.fn();
  const onUsername = jest.fn();
  const all: AccountDeps = {
    auth: auth!,
    usernames: usernames!,
    data: onlineData!,
    appleSheet,
    analytics,
    pushes: undefined,
    ...deps,
  };
  const ui = (visit: number) => (
    <AccountScreen deps={all} onBack={onBack} onUsername={onUsername} visit={visit} />
  );
  const view = await renderWithRoot(ui(0));
  /** The route shows the screen again (its focus): `visit` changes. */
  const showAgain = async (visit: number) => view.rerender(ui(visit));
  return { analytics, onBack, onUsername, showAgain };
}

/** A guest with a guest number (made at the first invite). */
async function guest(): Promise<string> {
  const user = await signInForOnline(auth!);
  await onlineFake.invites.createInvite(GAME);
  return onlineFake.guestNumber(user.id);
}

/** A saved account (Apple), signed in on this phone. */
async function saved(name?: string): Promise<void> {
  const nonce = await auth!.keyNonce();
  await auth!.signInWithKey({
    provider: 'apple',
    idToken: memoryAppleIdToken('apple-1', nonce),
    nonce,
  });
  rememberOnlineAccount();
  if (name !== undefined) {
    await usernames!.setMine({ name, acceptTerms: TERMS_VERSION, ageChecked: true });
  }
}

/** The username step shows after the action (#483); Not now skips it. */
async function skipName(user: ReturnType<typeof setupUser>) {
  expect(await screen.findByRole('header', { name: 'Pick a username' })).toBeOnTheScreen();
  await user.press(within(screen.getByTestId('account-username-step')).getByText('Not now'));
}

/** The confirm dialog, after a tap on `row`. */
async function dialogFrom(user: ReturnType<typeof setupUser>, row: string) {
  await user.press(screen.getByTestId(row));
  return within(screen.getByTestId('account-dialog'));
}

describe('Settings → Account row', () => {
  it('shows in a build with online play, also on a phone that never played online', async () => {
    const user = setupUser();
    const onAccount = jest.fn();
    await renderWithRoot(<SettingsScreen onAccount={onAccount} onBlocked={jest.fn()} />);
    expect(screen.queryByTestId('settings-blocked')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Account' }));
    expect(onAccount).toHaveBeenCalledTimes(1);
  });

  it('is hidden in a build with no online play, and no delete row is left in Privacy', async () => {
    rememberOnlineAccount();
    await renderWithRoot(<SettingsScreen />);
    expect(screen.queryByTestId('settings-account')).toBeNull();
    expect(screen.queryByText(/Delete my online data/)).toBeNull();
  });
});

describe('<AccountScreen /> offline', () => {
  it('asks the server nothing and says what stays on the phone', async () => {
    const ready = jest.spyOn(auth!, 'ready');
    await open();
    expect(
      screen.getByText('You are not signed in. You play on this phone only.'),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Kept on this phone: your games against the bot, your history and your settings.',
      ),
    ).toBeOnTheScreen();
    expect(ready).not.toHaveBeenCalled();
    expect(screen.queryByTestId('account-delete')).toBeNull();
  });

  it('signs in with Apple and never makes a guest', async () => {
    const user = setupUser();
    const { analytics } = await open();
    await user.press(await screen.findByTestId('account-apple'));
    await skipName(user);
    expect(await screen.findByTestId('account-saved')).toBeOnTheScreen();
    expect(onlineFake.authStore.session).toEqual({ id: 'user-1', isGuest: false });
    expect(onlineFake.authStore.guests).toBe(0);
    expect(hasOnlineAccount()).toBe(true);
    expect(screen.getByRole('button', { name: /Username/ })).toBeOnTheScreen();
    expect(analytics.sent).toEqual([
      { type: 'track', event: 'online_sign_in', props: { method: 'apple' } },
    ]);
    expect(JSON.stringify(analytics.sent)).not.toMatch(/user-1|apple-1/);
  });

  it('signs in to an account that has a username: no username step (#483)', async () => {
    const user = setupUser();
    await saved('Maria');
    await auth!.signOut();
    await open();
    await user.press(await screen.findByTestId('account-apple'));
    expect(await screen.findByTestId('account-saved')).toBeOnTheScreen();
    expect(onlineFake.authStore.session).toEqual({ id: 'user-1', isGuest: false });
    expect(screen.getByText('Maria')).toBeOnTheScreen();
    expect(screen.queryByTestId('account-username-step')).toBeNull();
  });

  it('a phone with no Apple ID says so', async () => {
    const user = setupUser();
    onlineFake.appleSheet.next = 'unfinished';
    await open();
    await user.press(await screen.findByTestId('account-apple'));
    const text = 'Check that this phone is signed in to an Apple ID in Settings.';
    const problem = within(await screen.findByTestId('account-problem'));
    expect(problem.getByText('Apple sign-in did not finish')).toBeOnTheScreen();
    expect(problem.getByText(text)).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith(`Apple sign-in did not finish. ${text}`);
    expect(onlineFake.authStore.session).toBeNull();
    // OK closes the popup; the screen stays as it was.
    await user.press(problem.getByText('OK'));
    expect(screen.queryByTestId('account-problem')).toBeNull();
    expect(screen.getByTestId('account-offline')).toBeOnTheScreen();
  });

  it('with Apple off on the server says so, not "check the connection" (#462)', async () => {
    const user = setupUser();
    onlineFake.authStore.offKeys.push('apple');
    await open();
    await user.press(await screen.findByTestId('account-apple'));
    const problem = within(await screen.findByTestId('account-problem'));
    expect(problem.getByText('Sign in with Apple is not ready')).toBeOnTheScreen();
    expect(
      problem.getByText('It is off on our server for now. Try email, or try again later.'),
    ).toBeOnTheScreen();
    expect(onlineFake.authStore.session).toBeNull();
  });

  it('a closed Apple sheet is no problem', async () => {
    const user = setupUser();
    onlineFake.appleSheet.next = 'cancel';
    await open();
    await user.press(await screen.findByTestId('account-apple'));
    expect(screen.getByTestId('account-offline')).toBeOnTheScreen();
    expect(screen.queryByTestId('account-problem')).toBeNull();
  });

  it('shows no Apple button where Apple sign-in does not work (Android); email works', async () => {
    onlineFake.appleSheet.available = false;
    await open();
    expect(screen.getByRole('button', { name: 'Continue with email' })).toBeOnTheScreen();
    expect(screen.queryByTestId('account-apple')).toBeNull();
  });

  it('signs in with an email code and never makes a guest (#433)', async () => {
    const user = setupUser();
    const { analytics } = await open();
    await user.press(screen.getByRole('button', { name: 'Continue with email' }));
    expect(await screen.findByRole('header', { name: 'Sign in with email' })).toBeOnTheScreen();
    await enterEmailCode(user, onlineFake.authStore, 'Eleni@Example.com');
    await skipName(user);
    expect(await screen.findByTestId('account-saved')).toBeOnTheScreen();
    expect(onlineFake.authStore.session).toEqual({ id: 'user-1', isGuest: false });
    expect(onlineFake.authStore.keys).toEqual({ 'email:eleni@example.com': 'user-1' });
    expect(onlineFake.authStore.guests).toBe(0);
    expect(hasOnlineAccount()).toBe(true);
    expect(reminders.state().stopped).toBe(true);
    expect(analytics.sent).toEqual([
      { type: 'track', event: 'online_sign_in', props: { method: 'email' } },
    ]);
    // Never the address or the code.
    expect(JSON.stringify(analytics.sent)).not.toMatch(/eleni|example|100001/i);
  });

  it('Cancel on the email step shows the cards again', async () => {
    const user = setupUser();
    await open();
    await user.press(screen.getByRole('button', { name: 'Continue with email' }));
    await user.press(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByTestId('account-offline')).toBeOnTheScreen();
    expect(onlineFake.authStore.sentEmailCodes).toEqual([]);
  });
});

describe('<AccountScreen /> as a guest', () => {
  it('shows the guest name and what is kept where; no Sign out', async () => {
    const number = await guest();
    await open();
    expect(await screen.findByText(`You play as Guest ${number}`)).toBeOnTheScreen();
    expect(screen.getByText(/Kept on our server: your online games/)).toBeOnTheScreen();
    expect(screen.getByText(/A guest account opens only on this phone/)).toBeOnTheScreen();
    expect(screen.queryByTestId('account-sign-out')).toBeNull();
  });

  it('shows a guest what a saved account gives, with no sample (#463)', async () => {
    await guest();
    await open();
    expect(await screen.findByTestId('account-benefits')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Your record with each friend\./)).toBeOnTheScreen();
    expect(screen.queryByTestId('account-benefits-sample')).toBeNull();
  });

  it('a guest with no number yet plays as "a guest"', async () => {
    await signInForOnline(auth!);
    await open();
    expect(await screen.findByText('You play as a guest.')).toBeOnTheScreen();
  });

  it('a server from before #402 sends no guest number: no "Guest " with nothing after it', async () => {
    await guest();
    const old: typeof usernames = {
      ...usernames!,
      mine: async () => {
        const { guestNumber: _dropped, ...rest } = await usernames!.mine();
        return rest as Awaited<ReturnType<NonNullable<typeof usernames>['mine']>>;
      },
    };
    await open({ usernames: old });
    expect(await screen.findByText('You play as a guest.')).toBeOnTheScreen();
  });

  it('saves the account with Apple and keeps the same id', async () => {
    const user = setupUser();
    await guest();
    await open();
    await user.press(await screen.findByTestId('account-save-apple'));
    expect(await screen.findByText('Your account is saved.')).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith('Your account is saved.');
    await skipName(user);
    expect(await screen.findByTestId('account-saved')).toBeOnTheScreen();
    expect(onlineFake.authStore.session).toEqual({ id: 'guest-1', isGuest: false });
    expect(onlineFake.authStore.keys).toEqual({ 'apple:apple-1': 'guest-1' });
    // The one key: Remove is off.
    expect(screen.getByRole('button', { name: 'Remove Sign in with Apple' })).toBeDisabled();
    expect(screen.getByText('An account keeps at least one way to sign in.')).toBeOnTheScreen();
  });

  it('asks for a username after the save, under the note; Save shows the name (#483)', async () => {
    const user = setupUser();
    await guest();
    await open();
    await user.press(await screen.findByTestId('account-save-apple'));
    expect(await screen.findByRole('header', { name: 'Pick a username' })).toBeOnTheScreen();
    expect(screen.getByText('Your account is saved.')).toBeOnTheScreen();
    // The step stands in place of the cards.
    expect(screen.queryByTestId('account-saved')).toBeNull();
    await user.type(screen.getByTestId('username-input'), 'Nikos');
    await user.press(screen.getByRole('switch', { name: 'I accept the terms of use' }));
    await user.press(screen.getByRole('switch', { name: 'I am 16 or older' }));
    const mine = jest.spyOn(usernames!, 'mine');
    await user.press(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByTestId('account-saved')).toBeOnTheScreen();
    expect(screen.queryByTestId('account-username-step')).toBeNull();
    expect(onlineFake.server().nameOf('guest-1')).toEqual({ kind: 'username', name: 'Nikos' });
    // The card takes the new name from the save: no reload.
    expect(screen.getByText('Nikos')).toBeOnTheScreen();
    expect(mine).not.toHaveBeenCalled();
  });

  it('Not now hides the step and loads nothing (#483)', async () => {
    const user = setupUser();
    await guest();
    await open();
    await user.press(await screen.findByTestId('account-save-apple'));
    expect(await screen.findByTestId('account-username-step')).toBeOnTheScreen();
    const mine = jest.spyOn(usernames!, 'mine');
    await user.press(within(screen.getByTestId('account-username-step')).getByText('Not now'));
    expect(screen.getByTestId('account-saved')).toBeOnTheScreen();
    expect(screen.getByText('Pick one')).toBeOnTheScreen();
    expect(mine).not.toHaveBeenCalled();
  });

  it('a newer load during the save still shows the username step (#483)', async () => {
    const user = setupUser();
    await guest();
    const { showAgain } = await open();
    await screen.findByTestId('account-guest');
    // Hold the reload after the save; the screen shows again meanwhile.
    const mine = usernames!.mine.bind(usernames);
    let held = true;
    let answer: () => void = () => {};
    jest
      .spyOn(usernames!, 'mine')
      .mockImplementation(() =>
        held ? new Promise((resolve) => (answer = () => resolve(mine()))) : mine(),
      );
    await user.press(screen.getByTestId('account-save-apple'));
    held = false;
    await act(async () => showAgain(1));
    answer();
    expect(await screen.findByRole('header', { name: 'Pick a username' })).toBeOnTheScreen();
  });

  it('a reload that fails drops the step: Try again, then the step (#483)', async () => {
    const user = setupUser();
    await guest();
    await open();
    await screen.findByTestId('account-guest');
    const mine = usernames!.mine.bind(usernames);
    jest
      .spyOn(usernames!, 'mine')
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(() => mine());
    await user.press(screen.getByTestId('account-save-apple'));
    expect(await screen.findByTestId('account-failed')).toBeOnTheScreen();
    expect(screen.queryByTestId('account-username-step')).toBeNull();
    await user.press(screen.getByTestId('account-retry'));
    expect(await screen.findByRole('header', { name: 'Pick a username' })).toBeOnTheScreen();
  });

  it('an Apple ID with another account asks; Keep the guest leaves the guest as it is', async () => {
    const user = setupUser();
    await guest();
    onlineFake.authStore.keys['apple:apple-1'] = 'user-9';
    await open();
    await user.press(await screen.findByTestId('account-save-apple'));
    const dialog = within(await screen.findByTestId('account-move-dialog'));
    expect(dialog.getByText('This Apple ID has an account already')).toBeOnTheScreen();
    expect(dialog.getByText('0 games in progress')).toBeOnTheScreen();
    expect(dialog.getByText('1 open invite')).toBeOnTheScreen();
    await user.press(dialog.getByText('Keep the guest'));
    expect(
      await screen.findByText(
        'This Apple ID has another Tavlaki account already. Your guest account stays as it is.',
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('account-move-dialog')).toBeNull();
    expect(onlineFake.authStore.session).toEqual({ id: 'guest-1', isGuest: true });
    expect(screen.getByTestId('account-guest')).toBeOnTheScreen();
  });

  it('saves the account with an email code and keeps the same id (#433)', async () => {
    const user = setupUser();
    await guest();
    const { analytics } = await open();
    await user.press(await screen.findByRole('button', { name: 'Save with email' }));
    expect(await screen.findByRole('header', { name: 'Save with email' })).toBeOnTheScreen();
    await enterEmailCode(user, onlineFake.authStore, 'kostas@example.com');
    expect(await screen.findByText('Your account is saved.')).toBeOnTheScreen();
    await skipName(user);
    expect(await screen.findByTestId('account-saved')).toBeOnTheScreen();
    expect(onlineFake.authStore.session).toEqual({ id: 'guest-1', isGuest: false });
    expect(onlineFake.authStore.keys).toEqual({ 'email:kostas@example.com': 'guest-1' });
    expect(screen.getByRole('button', { name: 'Remove Email code' })).toBeDisabled();
    // A save is no new sign-in.
    expect(analytics.sent).toEqual([]);
  });

  it('a guest on Android saves with email: no Apple button', async () => {
    onlineFake.appleSheet.available = false;
    await guest();
    await open();
    expect(await screen.findByRole('button', { name: 'Save with email' })).toBeOnTheScreen();
    expect(screen.queryByTestId('account-save-apple')).toBeNull();
  });

  it('an email with another account asks; Keep the guest says the email has one', async () => {
    const user = setupUser();
    await guest();
    onlineFake.authStore.keys['email:maria@example.com'] = 'user-9';
    await open();
    await user.press(await screen.findByRole('button', { name: 'Save with email' }));
    await enterEmailCode(user, onlineFake.authStore, 'maria@example.com');
    const dialog = within(await screen.findByTestId('account-move-dialog'));
    expect(dialog.getByText('This email has an account already')).toBeOnTheScreen();
    await user.press(dialog.getByText('Keep the guest'));
    expect(
      await screen.findByText(
        'This email has another Tavlaki account already. Your guest account stays as it is.',
      ),
    ).toBeOnTheScreen();
    expect(onlineFake.authStore.session).toEqual({ id: 'guest-1', isGuest: true });
    expect(screen.getByTestId('account-guest')).toBeOnTheScreen();
  });

  it('Move my games moves the guest’s games into the account and signs in there (#403)', async () => {
    const user = setupUser();
    await guest();
    // A friend accepts the guest's invite: one game in progress.
    const [code] = (await onlineFake.invites.listMyInvites()).map((invite) => invite.code);
    const gameId = await onlineFake.server().invitesFor('friend').acceptInvite(code!);
    onlineFake.authStore.keys['apple:apple-1'] = 'user-9';
    await open();
    await user.press(await screen.findByTestId('account-save-apple'));
    const dialog = within(await screen.findByTestId('account-move-dialog'));
    expect(dialog.getByText('1 game in progress')).toBeOnTheScreen();
    await user.press(dialog.getByText('Move my games'));
    expect(await screen.findByText('Your games are in your account now.')).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith('Your games are in your account now.');
    expect(onlineFake.authStore.session).toEqual({ id: 'user-9', isGuest: false });
    expect(onlineFake.server().getGame(gameId)?.players).toEqual({
      white: 'user-9',
      black: 'friend',
    });
    await skipName(user);
    expect(await screen.findByTestId('account-saved')).toBeOnTheScreen();
  });

  it('a failed move keeps the guest and says so', async () => {
    const user = setupUser();
    await guest();
    onlineFake.authStore.keys['apple:apple-1'] = 'user-9';
    await open();
    await user.press(await screen.findByTestId('account-save-apple'));
    const dialog = within(await screen.findByTestId('account-move-dialog'));
    // The offer runs out before the tap.
    onlineFake.authStore.openMoveTickets.length = 0;
    await user.press(dialog.getByText('Move my games'));
    const problem = within(await screen.findByTestId('account-problem'));
    expect(problem.getByText('That did not work')).toBeOnTheScreen();
    expect(screen.queryByText(/Check the connection/)).toBeNull();
    expect(onlineFake.authStore.session).toEqual({ id: 'guest-1', isGuest: true });
  });

  it('a closed Apple sheet saves nothing and says nothing', async () => {
    const user = setupUser();
    await guest();
    onlineFake.appleSheet.next = 'cancel';
    await open();
    await user.press(await screen.findByTestId('account-save-apple'));
    expect(screen.queryByTestId('account-note')).toBeNull();
    expect(screen.queryByTestId('account-problem')).toBeNull();
    expect(onlineFake.authStore.session?.isGuest).toBe(true);
  });

  it('deletes the guest account after a dialog that says what happens', async () => {
    const user = setupUser();
    await guest();
    const code = await onlineFake.invites.createInvite(GAME);
    await open();
    await screen.findByTestId('account-guest');
    const dialog = await dialogFrom(user, 'account-delete');
    expect(dialog.getByRole('header', { name: 'Delete your guest account?' })).toBeOnTheScreen();
    for (const line of [
      'Games in progress end now. You resign them, so you lose them.',
      'Your open invites are cancelled.',
      'Turn notifications stop.',
      'Your guest name is deleted.',
      'Finished games stay for the other players, with no name. Your games and history on this phone stay too. You cannot undo it.',
    ]) {
      expect(dialog.getByText(line)).toBeOnTheScreen();
    }
    await user.press(dialog.getByRole('button', { name: 'Delete' }));
    expect(announce).toHaveBeenCalledWith('Deleting your account…');
    const done = 'Your account is deleted. The next Play a friend starts fresh.';
    expect(await screen.findByText(done)).toBeOnTheScreen();
    expect(announce).toHaveBeenLastCalledWith(done);
    expect(screen.getByTestId('account-offline')).toBeOnTheScreen();
    expect(auth!.currentUser()).toBeNull();
    expect(hasOnlineAccount()).toBe(false);
    expect(onlineFake.server().getInvite(code)).toBeNull();
    await expect(signInForOnline(auth!)).resolves.toEqual({ id: 'guest-2', isGuest: true });
  });

  it('Cancel keeps all', async () => {
    const user = setupUser();
    await guest();
    await open();
    await screen.findByTestId('account-guest');
    const dialog = await dialogFrom(user, 'account-delete');
    await user.press(dialog.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('account-dialog')).toBeNull();
    expect(auth!.currentUser()).not.toBeNull();
    expect(hasOnlineAccount()).toBe(true);
  });

  it('a delete with no answer fails after the time limit; Delete again works', async () => {
    const user = setupUser();
    await guest();
    jest.spyOn(onlineData!, 'deleteMyData').mockReturnValueOnce(new Promise(() => {}));
    await open();
    await screen.findByTestId('account-guest');
    await user.press(
      (await dialogFrom(user, 'account-delete')).getByRole('button', { name: 'Delete' }),
    );
    expect(screen.getByTestId('account-delete')).toBeDisabled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(DELETE_TIME_LIMIT_MS);
    });
    const problem = within(screen.getByTestId('account-problem'));
    expect(problem.getByText('Your account was not deleted')).toBeOnTheScreen();
    expect(announce).toHaveBeenLastCalledWith(
      'Your account was not deleted. Check the connection and try again.',
    );
    expect(hasOnlineAccount()).toBe(true);
    await user.press(problem.getByText('OK'));
    await user.press(
      (await dialogFrom(user, 'account-delete')).getByRole('button', { name: 'Delete' }),
    );
    expect(await screen.findByTestId('account-offline')).toBeOnTheScreen();
    expect(auth!.currentUser()).toBeNull();
  });
});

describe('<AccountScreen /> with a saved account', () => {
  it('shows the username, which opens Settings → Username', async () => {
    const user = setupUser();
    await saved('Maria');
    const { onUsername } = await open();
    expect(await screen.findByText('You play as Maria')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: /Username/ }));
    expect(onUsername).toHaveBeenCalledTimes(1);
  });

  it('with no username yet says so', async () => {
    await saved();
    await open();
    expect(
      await screen.findByText('You have no username yet. Other players see your guest name.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Pick one')).toBeOnTheScreen();
  });

  it('signs out after a dialog; the account and its key stay', async () => {
    const user = setupUser();
    await saved('Maria');
    await open();
    await screen.findByTestId('account-saved');
    const dialog = await dialogFrom(user, 'account-sign-out');
    expect(dialog.getByRole('header', { name: 'Sign out?' })).toBeOnTheScreen();
    await user.press(dialog.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText('You are signed out.')).toBeOnTheScreen();
    expect(screen.getByTestId('account-offline')).toBeOnTheScreen();
    expect(auth!.currentUser()).toBeNull();
    expect(hasOnlineAccount()).toBe(false);
    expect(onlineFake.authStore.keys).toEqual({ 'apple:apple-1': 'user-1' });
    // Apple brings the same account back, with its name.
    await user.press(screen.getByTestId('account-apple'));
    expect(await screen.findByText('You play as Maria')).toBeOnTheScreen();
  });

  it('the delete dialog names the username and the ways to sign in', async () => {
    const user = setupUser();
    await saved('Maria');
    await open();
    await screen.findByTestId('account-saved');
    const dialog = await dialogFrom(user, 'account-delete');
    expect(dialog.getByRole('header', { name: 'Delete your account?' })).toBeOnTheScreen();
    expect(
      dialog.getByText('Your username and your ways to sign in are removed.'),
    ).toBeOnTheScreen();
    await user.press(dialog.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByTestId('account-offline')).toBeOnTheScreen();
    expect(auth!.currentUser()).toBeNull();
  });

  it('offers a way to sign in the account does not have yet', async () => {
    await saved();
    const noKeys: AuthProvider = { ...auth!, listKeys: () => Promise.resolve([]) };
    await open({ auth: noKeys });
    expect(await screen.findByRole('button', { name: 'Add Sign in with Apple' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add Email code' })).toBeOnTheScreen();
  });

  it('adds an email key to a saved account (#433)', async () => {
    const user = setupUser();
    await saved('Maria');
    await open();
    await user.press(await screen.findByRole('button', { name: 'Add Email code' }));
    expect(await screen.findByRole('header', { name: 'Add Email code' })).toBeOnTheScreen();
    await enterEmailCode(user, onlineFake.authStore, 'maria@example.com');
    expect(await screen.findByText('Your account is saved.')).toBeOnTheScreen();
    expect(await screen.findByTestId('account-key-email')).toBeOnTheScreen();
    expect(onlineFake.authStore.keys).toEqual({
      'apple:apple-1': 'user-1',
      'email:maria@example.com': 'user-1',
    });
  });

  it('adding a key to a saved account with no username does not ask for one (#483)', async () => {
    const user = setupUser();
    await saved();
    await open();
    await user.press(await screen.findByRole('button', { name: 'Add Email code' }));
    await enterEmailCode(user, onlineFake.authStore, 'maria@example.com');
    expect(await screen.findByTestId('account-key-email')).toBeOnTheScreen();
    expect(screen.queryByTestId('account-username-step')).toBeNull();
  });

  it('an email of another saved account stays on the email step and says so', async () => {
    const user = setupUser();
    await saved('Maria');
    onlineFake.authStore.keys['email:eleni@example.com'] = 'user-9';
    await open();
    await user.press(await screen.findByRole('button', { name: 'Add Email code' }));
    await enterEmailCode(user, onlineFake.authStore, 'eleni@example.com');
    expect(
      await screen.findByText('This email has another Tavlaki account already.'),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('account-move-dialog')).toBeNull();
    expect(screen.getByTestId('email-code-form')).toBeOnTheScreen();
  });

  it('says so when the server refuses to remove the last key', async () => {
    const user = setupUser();
    await saved();
    // Two keys on the screen, one on the server.
    const twoKeys: AuthProvider = {
      ...auth!,
      listKeys: () => Promise.resolve([{ provider: 'apple' }, { provider: 'apple' }]),
    };
    await open({ auth: twoKeys });
    const remove = await screen.findAllByRole('button', { name: 'Remove Sign in with Apple' });
    await user.press(remove[0]!);
    expect(await screen.findByTestId('account-problem')).toHaveTextContent(
      'An account keeps at least one way to sign in. Add another one first.',
      { exact: false },
    );
    expect(onlineFake.authStore.keys).toEqual({ 'apple:apple-1': 'user-1' });
  });
});

describe('<AccountScreen /> loading', () => {
  it('a session whose user is gone on the server signs out and shows the offline state', async () => {
    await guest();
    // The account is deleted elsewhere (Apple's delete notice, another phone).
    await onlineData!.deleteMyData();
    expect(onlineFake.authStore.session).not.toBeNull();
    await open();
    expect(await screen.findByTestId('account-offline')).toBeOnTheScreen();
    expect(screen.queryByTestId('account-failed')).toBeNull();
    expect(onlineFake.authStore.session).toBeNull();
    expect(hasOnlineAccount()).toBe(false);
  });

  it('keeps the cards on the screen while it loads again after an action', async () => {
    const user = setupUser();
    await guest();
    await open();
    await screen.findByTestId('account-guest');
    // Hold the reload after the save.
    let answer: () => void = () => {};
    const mine = usernames!.mine.bind(usernames);
    jest
      .spyOn(usernames!, 'mine')
      .mockImplementation(() => new Promise((resolve) => (answer = () => resolve(mine()))));
    await user.press(screen.getByTestId('account-save-apple'));
    expect(await screen.findByText('Your account is saved.')).toBeOnTheScreen();
    expect(screen.getByTestId('account-guest')).toBeOnTheScreen();
    expect(screen.queryByText('Loading your account…')).toBeNull();
    await act(async () => answer());
    await skipName(user);
    expect(await screen.findByTestId('account-saved')).toBeOnTheScreen();
  });

  it('says so when the server does not answer; Try again loads again', async () => {
    const user = setupUser();
    await guest();
    jest.spyOn(usernames!, 'mine').mockRejectedValueOnce(new Error('offline'));
    await open();
    expect(
      await screen.findByText('Could not load your account. Check the connection and try again.'),
    ).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('account-guest')).toBeOnTheScreen();
  });

  it('a phone whose session is gone shows the offline state', async () => {
    rememberOnlineAccount();
    await open();
    expect(await screen.findByTestId('account-offline')).toBeOnTheScreen();
  });

  it('Back goes back', async () => {
    const user = setupUser();
    const { onBack } = await open();
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('speaks Greek', async () => {
    await guest();
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await open();
    expect(
      await screen.findByRole('button', { name: /Διαγραφή του λογαριασμού επισκέπτη μου/ }),
    ).toBeOnTheScreen();
    expect(screen.getByText(/^Παίζεις ως Επισκέπτης \d{4}$/)).toBeOnTheScreen();
  });
});

describe('addableKeys', () => {
  it('lists the kinds the account has not, that this phone can add', () => {
    expect(addableKeys([], true)).toEqual(['apple', 'email']);
    // The email code works on every phone (#433).
    expect(addableKeys([], false)).toEqual(['email']);
    expect(addableKeys([{ provider: 'apple' }], true)).toEqual(['email']);
    expect(addableKeys([{ provider: 'email' }], true)).toEqual(['apple']);
    expect(addableKeys([{ provider: 'apple' }, { provider: 'email' }], true)).toEqual([]);
  });
});
