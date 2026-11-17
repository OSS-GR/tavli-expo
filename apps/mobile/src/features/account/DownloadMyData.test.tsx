/**
 * Download my data (#445) on Settings → Account, on the Jest online fake:
 * the row for a guest and a saved account, the share sheet with the
 * server's copy, the busy row and the problem popups.
 */
import {
  MY_DATA_FORMAT,
  createRecordingAnalytics,
  memoryAppleIdToken,
  type MyData,
} from '@tavli/contracts';
import { act, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Share } from 'react-native';

import { signInForOnline } from '@/features/online/account';
import { rememberOnlineAccount } from '@/features/online/accountHint';
import i18n from '@/i18n';
import { appleSheet, auth, onlineData, usernames } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { onlineFake } from '../../../test/onlineFake';
import { renderWithRoot } from '../../../test/render';

import { AccountScreen } from './AccountScreen';
import { EXPORT_TIME_LIMIT_MS, myDataFileName } from './myDataShare';

runOnFakeTimers();

const GAME = { choice: 'portes', targetPoints: 3, turnTimeMinutes: null } as const;

let announce: jest.SpyInstance;
let share: jest.SpyInstance;

beforeEach(() => {
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  share = jest
    .spyOn(Share, 'share')
    .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
});

afterEach(async () => {
  jest.restoreAllMocks();
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

async function open() {
  const analytics = createRecordingAnalytics();
  await renderWithRoot(
    <AccountScreen
      deps={{
        auth: auth!,
        usernames: usernames!,
        data: onlineData!,
        appleSheet,
        analytics,
        pushes: undefined,
      }}
      onBack={jest.fn()}
      onUsername={jest.fn()}
      visit={1}
    />,
  );
}

/** A guest with a guest number and an open invite. Returns the player id. */
async function guest(): Promise<string> {
  const user = await signInForOnline(auth!);
  await onlineFake.invites.createInvite(GAME);
  return user.id;
}

/** The copy the share sheet got. */
function sharedCopy(): MyData {
  const [[content]] = share.mock.calls as [[{ title: string; message: string }]];
  return JSON.parse(content.message) as MyData;
}

describe('Download my data (#445)', () => {
  it('a guest shares the copy as JSON, named like a file', async () => {
    const user = setupUser();
    const id = await guest();
    await open();
    const row = await screen.findByTestId('account-download');
    expect(row).toHaveAccessibleName('Download my data');
    expect(within(row).getByText('A copy of what our server keeps about you')).toBeOnTheScreen();
    await user.press(row);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

    expect(share).toHaveBeenCalledTimes(1);
    const copy = sharedCopy();
    expect(share).toHaveBeenCalledWith({
      title: myDataFileName(copy),
      message: expect.stringContaining(`"format": "${MY_DATA_FORMAT}"`),
    });
    expect(myDataFileName(copy)).toMatch(/^tavlaki-my-data-\d{4}-\d{2}-\d{2}\.json$/);
    expect(copy.account).toMatchObject({
      kind: 'guest',
      guestNumber: onlineFake.guestNumber(id),
    });
    expect(copy.invites.map((invite) => invite.status)).toEqual(['open']);
    expect(screen.queryByTestId('account-download-problem')).toBeNull();
  });

  it('a saved account has the row too, above Sign out', async () => {
    const nonce = await auth!.keyNonce();
    await auth!.signInWithKey({
      provider: 'apple',
      idToken: memoryAppleIdToken('apple-1', nonce),
      nonce,
    });
    rememberOnlineAccount();
    await open();
    expect(await screen.findByTestId('account-saved')).toBeOnTheScreen();
    expect(screen.getByTestId('account-download')).toHaveAccessibleName('Download my data');
    expect(screen.getByTestId('account-sign-out')).toBeOnTheScreen();
  });

  it('while it loads the row says so and takes no second tap', async () => {
    const user = setupUser();
    await guest();
    let answer: (data: MyData) => void = () => {};
    const real = onlineData!.exportMyData.bind(onlineData);
    const copy = await real();
    const exportMyData = jest
      .spyOn(onlineData!, 'exportMyData')
      .mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await open();
    await user.press(await screen.findByTestId('account-download'));

    const row = screen.getByTestId('account-download');
    expect(within(row).getByText('Getting your data…')).toBeOnTheScreen();
    expect(row).toBeDisabled();
    expect(announce).toHaveBeenCalledWith('Getting your data…');
    await user.press(row);
    expect(exportMyData).toHaveBeenCalledTimes(1);

    await act(async () => {
      answer(copy);
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(share).toHaveBeenCalledTimes(1);
    expect(within(row).getByText('A copy of what our server keeps about you')).toBeOnTheScreen();
    expect(row).not.toBeDisabled();
  });

  it('no answer: after the time limit it says there is no connection', async () => {
    const user = setupUser();
    await guest();
    jest.spyOn(onlineData!, 'exportMyData').mockReturnValueOnce(new Promise(() => {}));
    await open();
    await user.press(await screen.findByTestId('account-download'));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(EXPORT_TIME_LIMIT_MS);
    });
    const problem = within(screen.getByTestId('account-download-problem'));
    expect(problem.getByText('No connection')).toBeOnTheScreen();
    expect(share).not.toHaveBeenCalled();
    await user.press(problem.getByText('OK'));
    expect(screen.queryByTestId('account-download-problem')).toBeNull();
  });

  it('an account the server no longer has says so, not "check the connection"', async () => {
    const user = setupUser();
    await guest();
    jest
      .spyOn(onlineData!, 'exportMyData')
      .mockRejectedValueOnce({ code: 'NOT_SIGNED_IN', message: 'this account does not exist' });
    await open();
    await user.press(await screen.findByTestId('account-download'));
    const problem = within(await screen.findByTestId('account-download-problem'));
    expect(problem.getByText('This account is gone')).toBeOnTheScreen();
    expect(problem.queryByText(/connection/)).toBeNull();
  });

  it('a share sheet that fails says the data did not download', async () => {
    const user = setupUser();
    await guest();
    share.mockRejectedValueOnce(new Error('no sheet'));
    await open();
    await user.press(await screen.findByTestId('account-download'));
    const problem = within(await screen.findByTestId('account-download-problem'));
    expect(problem.getByText('Your data did not download')).toBeOnTheScreen();
    expect(problem.getByText('Try again in a moment.')).toBeOnTheScreen();
  });

  it('reads in Greek', async () => {
    await guest();
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await open();
    expect(await screen.findByTestId('account-download')).toHaveAccessibleName(
      'Λήψη των δεδομένων μου',
    );
  });
});
