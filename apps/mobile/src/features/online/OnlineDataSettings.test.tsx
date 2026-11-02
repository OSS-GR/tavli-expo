/**
 * The "Delete my online data" row of Settings (#315), on the Jest online
 * fake: one in-memory server, `auth` and `onlineData` as the signed-in
 * user.
 */
import { act, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { SettingsScreen } from '@/features/settings/SettingsScreen';
import i18n from '@/i18n';
import { auth, onlineData } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { onlineFake } from '../../../test/onlineFake';
import { renderWithRoot } from '../../../test/render';

import { signInForOnline } from './account';
import { hasOnlineAccount, rememberOnlineAccount } from './accountHint';
import { DELETE_TIME_LIMIT_MS, type OnlineDataDeps } from './deleteData';

runOnFakeTimers();

const GAME = { choice: 'portes', targetPoints: 3, turnTimeMinutes: null } as const;

function deps(): OnlineDataDeps {
  return { auth: auth!, data: onlineData!, pushes: undefined };
}

let announce: jest.SpyInstance;
let focus: jest.SpyInstance;

beforeEach(() => {
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
});

afterEach(async () => {
  jest.restoreAllMocks();
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

/** Opens the confirm dialog from the row. */
async function openDialog(user: ReturnType<typeof setupUser>) {
  await user.press(screen.getByRole('button', { name: 'Delete my online data' }));
  return within(screen.getByTestId('online-data-dialog'));
}

describe('Delete my online data in Settings', () => {
  it('is hidden on a phone that never played online', async () => {
    await renderWithRoot(<SettingsScreen onlineData={deps()} />);
    expect(screen.queryByTestId('settings-online-data')).toBeNull();
  });

  it('is hidden in a build with no online play', async () => {
    rememberOnlineAccount();
    await renderWithRoot(<SettingsScreen />);
    expect(screen.queryByTestId('settings-online-data')).toBeNull();
  });

  it('opens a dialog that says what happens, with focus on its title; Cancel keeps all', async () => {
    const user = setupUser();
    await signInForOnline(auth!);
    await renderWithRoot(<SettingsScreen onlineData={deps()} />);
    expect(screen.getByText('Your online games and invites on our server.')).toBeOnTheScreen();

    const dialog = await openDialog(user);
    const title = dialog.getByRole('header', { name: 'Delete your online data?' });
    expect(title).toBeOnTheScreen();
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
    for (const line of [
      'Games in progress end now. You resign them, so you lose them.',
      'Your open invites are cancelled.',
      'Turn notifications stop.',
      'Finished games stay for the other players, with no name. Your games and history on this phone stay too. You cannot undo it.',
    ]) {
      expect(dialog.getByText(line)).toBeOnTheScreen();
    }
    await user.press(dialog.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('online-data-dialog')).toBeNull();
    expect(auth!.currentUser()).not.toBeNull();
    expect(hasOnlineAccount()).toBe(true);
  });

  it('deletes on Delete: progress, then done; the next Play a friend makes a new guest', async () => {
    const user = setupUser();
    await signInForOnline(auth!);
    const code = await onlineFake.invites.createInvite(GAME);
    await renderWithRoot(<SettingsScreen onlineData={deps()} />);

    const dialog = await openDialog(user);
    await user.press(dialog.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByTestId('online-data-dialog')).toBeNull();
    expect(announce).toHaveBeenCalledWith('Deleting your online data…');

    expect(await screen.findByText('Your online data is deleted.')).toBeOnTheScreen();
    expect(screen.getByText('The next Play a friend starts fresh.')).toBeOnTheScreen();
    expect(announce).toHaveBeenLastCalledWith('Your online data is deleted.');
    // Done: the row is no button any more.
    expect(screen.queryByRole('button', { name: /Delete my online data/ })).toBeNull();
    expect(auth!.currentUser()).toBeNull();
    expect(hasOnlineAccount()).toBe(false);
    expect(onlineFake.server().getInvite(code)).toBeNull();
    await expect(signInForOnline(auth!)).resolves.toEqual({ id: 'guest-2', isGuest: true });
  });

  it('shows an error when the server does not answer, and the row tries again', async () => {
    const user = setupUser();
    await signInForOnline(auth!);
    jest.spyOn(onlineData!, 'deleteMyData').mockReturnValueOnce(new Promise(() => {}));
    await renderWithRoot(<SettingsScreen onlineData={deps()} />);

    await user.press((await openDialog(user)).getByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Deleting your online data…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Delete my online data' })).toBeDisabled();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(DELETE_TIME_LIMIT_MS);
    });
    const failed = 'Could not delete your online data. Check the connection and try again.';
    expect(screen.getByText(failed)).toBeOnTheScreen();
    expect(announce).toHaveBeenLastCalledWith(failed);
    expect(auth!.currentUser()).not.toBeNull();
    expect(hasOnlineAccount()).toBe(true);

    await user.press((await openDialog(user)).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Your online data is deleted.')).toBeOnTheScreen();
    expect(auth!.currentUser()).toBeNull();
  });

  it('counts data that is gone already as deleted', async () => {
    const user = setupUser();
    await signInForOnline(auth!);
    await onlineData!.deleteMyData();
    await renderWithRoot(<SettingsScreen onlineData={deps()} />);
    await user.press((await openDialog(user)).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Your online data is deleted.')).toBeOnTheScreen();
    expect(hasOnlineAccount()).toBe(false);
  });

  it('speaks Greek', async () => {
    const user = setupUser();
    await signInForOnline(auth!);
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await renderWithRoot(<SettingsScreen onlineData={deps()} />);
    await user.press(screen.getByRole('button', { name: 'Διαγραφή των online δεδομένων μου' }));
    expect(within(screen.getByTestId('online-data-dialog')).getByRole('header')).toBeOnTheScreen();
  });
});
