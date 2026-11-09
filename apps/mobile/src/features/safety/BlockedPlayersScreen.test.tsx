/**
 * Settings → Blocked players (#435), on the Jest online fake.
 */
import type { Safety } from '@tavli/contracts';
import { act, render, screen } from '@testing-library/react-native';

import { rememberOnlineAccount } from '@/features/online/accountHint';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { auth } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { onlineFake } from '../../../test/onlineFake';
import { renderWithRoot } from '../../../test/render';

import { BlockedPlayersScreen } from './BlockedPlayersScreen';

runOnFakeTimers();

const ME = 'guest-1';
const OCT_28 = Date.UTC(2026, 9, 28, 12);

/** Lets the server answer (it answers on later microtasks). */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

/** Signs me in and blocks each player, one second apart (we met in a game). */
async function blockAll(...ids: string[]): Promise<void> {
  onlineFake.authStore.session = { id: ME, isGuest: true };
  for (const id of ids) {
    onlineFake.server().createGame(ME, { white: ME, black: id }, 'portes', 3, null);
    jest.advanceTimersByTime(1000);
    await onlineFake.server().safetyFor(ME).block(id);
  }
}

async function show(safety: Safety = onlineFake.safety) {
  const onBack = jest.fn();
  await render(<BlockedPlayersScreen auth={auth!} safety={safety} onBack={onBack} />);
  await flush();
  return onBack;
}

beforeEach(() => {
  jest.setSystemTime(OCT_28);
});

describe('<BlockedPlayersScreen />', () => {
  it('lists the blocked players newest first, with their names', async () => {
    await blockAll('ann', 'bob');
    await show();
    const rows = screen.queryAllByTestId(/^blocked-(ann|bob)$/).map((row) => row.props.testID);
    expect(rows).toEqual(['blocked-bob', 'blocked-ann']);
    const bob = `Guest ${onlineFake.guestNumber('bob')}`;
    expect(screen.getByText(bob)).toBeOnTheScreen();
    expect(screen.getAllByText('Blocked on Oct 28, 2026')).toHaveLength(2);
    expect(screen.getByRole('button', { name: `Unblock ${bob}` })).toBeOnTheScreen();
  });

  it('Unblock takes the row away, and the server forgets the block', async () => {
    await blockAll('ann', 'bob');
    await show();
    const user = setupUser();
    await user.press(screen.getByTestId('blocked-bob-unblock'));
    await flush();
    expect(screen.queryByTestId('blocked-bob')).toBeNull();
    expect(screen.getByTestId('blocked-ann')).toBeOnTheScreen();
    const left = await onlineFake.server().safetyFor(ME).listBlocked();
    expect(left.map((p) => p.playerId)).toEqual(['ann']);
    await user.press(screen.getByTestId('blocked-ann-unblock'));
    await flush();
    expect(screen.getByTestId('blocked-empty')).toBeOnTheScreen();
  });

  it('a failed Unblock keeps the row and says so', async () => {
    await blockAll('bob');
    const unblock = jest.fn().mockRejectedValue(new Error('offline'));
    await show({ ...onlineFake.safety, unblock });
    const user = setupUser();
    await user.press(screen.getByTestId('blocked-bob-unblock'));
    await flush();
    expect(screen.getByTestId('blocked-bob')).toBeOnTheScreen();
    expect(screen.getByTestId('blocked-unblock-failed')).toBeOnTheScreen();
  });

  it('with no blocks, says so', async () => {
    onlineFake.authStore.session = { id: ME, isGuest: true };
    await show();
    expect(screen.getByText('You have not blocked anyone.')).toBeOnTheScreen();
  });

  it('a phone with no session says it is not signed in, and makes no account', async () => {
    const list = jest.spyOn(onlineFake.safety, 'listBlocked');
    await show();
    expect(screen.getByTestId('blocked-signed-out')).toBeOnTheScreen();
    expect(list).not.toHaveBeenCalled();
    expect(onlineFake.authStore.guests).toBe(0);
    list.mockRestore();
  });

  it('a list that does not load can be tried again', async () => {
    await blockAll('bob');
    const listBlocked = jest
      .fn<ReturnType<Safety['listBlocked']>, []>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation(() => onlineFake.safety.listBlocked());
    await show({ ...onlineFake.safety, listBlocked });
    expect(screen.getByTestId('blocked-failed')).toBeOnTheScreen();
    const user = setupUser();
    await user.press(screen.getByTestId('blocked-retry'));
    await flush();
    expect(screen.getByTestId('blocked-bob')).toBeOnTheScreen();
  });

  it('Back calls onBack', async () => {
    onlineFake.authStore.session = { id: ME, isGuest: true };
    const onBack = await show();
    const user = setupUser();
    await user.press(screen.getByTestId('blocked-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('the Blocked players row of Settings', () => {
  it('is hidden on a phone that never played online', async () => {
    await renderWithRoot(<SettingsScreen onBlocked={jest.fn()} />);
    expect(screen.queryByTestId('settings-blocked')).toBeNull();
  });

  it('is hidden in a build with no online play', async () => {
    rememberOnlineAccount();
    await renderWithRoot(<SettingsScreen />);
    expect(screen.queryByTestId('settings-blocked')).toBeNull();
  });

  it('opens the list after this phone played online', async () => {
    const user = setupUser();
    const onBlocked = jest.fn();
    rememberOnlineAccount();
    await renderWithRoot(<SettingsScreen onBlocked={onBlocked} />);
    await user.press(screen.getByRole('button', { name: /^Blocked players/ }));
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });
});
