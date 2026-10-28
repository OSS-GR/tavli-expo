/**
 * "Your invites" on Home (#314), on the Jest online fake: one in-memory
 * server, and `auth` / `invites` as the signed-in user.
 */
import { INVITE_TIME_MS, type Invites } from '@tavli/contracts';
import { act, render, screen, within } from '@testing-library/react-native';

import { hasOnlineAccount, rememberOnlineAccount } from '@/features/online/accountHint';
import i18n from '@/i18n';
import { auth, invites } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { onlineFake } from '../../../test/onlineFake';

import { HomeInvites } from './HomeInvites';

runOnFakeTimers();

const ME = 'guest-1';
const FRIEND = 'bob';
const MINUTE = 60 * 1000;

function signIn(): void {
  onlineFake.authStore.session = { id: ME, isGuest: true };
}

/** A new invite of mine, one second after the last one. */
function newInvite(pace: 'live' | 'async' = 'live', points = 3): string {
  jest.advanceTimersByTime(1000);
  return onlineFake.server().createInvite(ME, 'portes', points, pace);
}

/** Lets the server answer (it answers on later microtasks). */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

async function show(port: Invites = invites!, onOpen = jest.fn()) {
  await render(<HomeInvites auth={auth!} invites={port} focused onOpen={onOpen} />);
  await flush();
  return { onOpen };
}

/** The codes of the rows, top to bottom. */
function rowCodes(): string[] {
  return screen
    .queryAllByTestId(/^home-invite-/)
    .map((row) => String(row.props.testID).replace('home-invite-', ''));
}

describe('<HomeInvites />', () => {
  it('shows nothing with no open invite', async () => {
    signIn();
    await show();
    expect(screen.queryByTestId('home-invites')).toBeNull();
  });

  it('lists my open invites, newest first; each row reads as one item and a tap opens it', async () => {
    signIn();
    const first = newInvite('live', 3);
    const second = newInvite('async', 1);
    onlineFake.server().createInvite(FRIEND, 'fevga', 5, 'live');
    const user = setupUser();
    const { onOpen } = await show();
    expect(screen.getByRole('header', { name: 'Your invites' })).toBeOnTheScreen();
    expect(rowCodes()).toEqual([second, first]);
    const row = screen.getByRole('button', {
      name: 'Invite, Portes, first to 3 points, Live, 23 h left',
    });
    expect(row).toHaveProp('accessibilityHint', 'Opens the invite. Share it again, or cancel it.');
    expect(within(row).getByText('Portes · first to 3 points')).toBeOnTheScreen();
    expect(within(row).getByText('Live · 23 h left')).toBeOnTheScreen();
    expect(within(row).getByText(`Code ${first}`)).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Invite, Portes, first to 1 point, Async, 24 h left' }),
    ).toBeOnTheScreen();
    await user.press(row);
    expect(onOpen).toHaveBeenCalledWith(first);
  });

  it('follows the server: a new invite, an accept, a decline and a cancel', async () => {
    signIn();
    const accepted = newInvite();
    await show();
    expect(rowCodes()).toEqual([accepted]);
    const declined = newInvite();
    const cancelled = newInvite();
    await flush();
    expect(rowCodes()).toEqual([cancelled, declined, accepted]);
    await act(async () => {
      await onlineFake.invitesFor(FRIEND).acceptInvite(accepted);
    });
    await flush();
    expect(rowCodes()).toEqual([cancelled, declined]);
    await act(async () => {
      await onlineFake.invitesFor(FRIEND).declineInvite(declined);
    });
    await flush();
    expect(rowCodes()).toEqual([cancelled]);
    await act(async () => {
      await invites!.cancelInvite(cancelled);
    });
    await flush();
    expect(screen.queryByTestId('home-invites')).toBeNull();
  });

  it('hides an invite at its expiresAt on the phone clock, before the server says so', async () => {
    signIn();
    const code = newInvite();
    await show();
    expect(rowCodes()).toEqual([code]);
    // Nearly a day later: the server has not marked it (no runDueTimeouts).
    await act(async () => {
      jest.setSystemTime(Date.now() + INVITE_TIME_MS - 2 * MINUTE);
      jest.advanceTimersByTime(30_000);
    });
    const row = screen.getByTestId(`home-invite-${code}`);
    expect(within(row).getByText('Live · 2 min left')).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(2 * MINUTE);
    });
    expect(onlineFake.server().getInvite(code)?.status).toBe('expired');
    expect(screen.queryByTestId('home-invites')).toBeNull();
  });

  it('shows nothing when the session does not load, and makes no guest', async () => {
    // Better Auth's ready() gives null with no network too: no sign-out.
    rememberOnlineAccount();
    newInvite();
    await show();
    expect(screen.queryByTestId('home-invites')).toBeNull();
    expect(onlineFake.authStore.guests).toBe(0);
    expect(hasOnlineAccount()).toBe(true);
  });

  it('shows nothing when the list does not load', async () => {
    signIn();
    newInvite();
    const offline: Invites = {
      ...invites!,
      watchMyInvites(_onList, onError) {
        void Promise.resolve().then(() => onError?.(new Error('network request failed')));
        return () => undefined;
      },
    };
    await show(offline);
    expect(screen.queryByTestId('home-invites')).toBeNull();
  });

  it('keeps the last list when the connection fails later', async () => {
    signIn();
    const code = newInvite();
    let fail: ((error: unknown) => void) | undefined;
    const losing: Invites = {
      ...invites!,
      watchMyInvites(onList, onError) {
        fail = onError;
        return invites!.watchMyInvites(onList);
      },
    };
    await show(losing);
    await act(async () => fail?.(new Error('connection lost')));
    expect(rowCodes()).toEqual([code]);
  });

  it('hides the list after a sign-out', async () => {
    signIn();
    rememberOnlineAccount();
    newInvite();
    await show();
    expect(screen.getByTestId('home-invites')).toBeOnTheScreen();
    await act(async () => {
      await auth!.signOut();
    });
    await flush();
    expect(screen.queryByTestId('home-invites')).toBeNull();
    expect(hasOnlineAccount()).toBe(false);
  });

  it('shows Greek', async () => {
    signIn();
    const code = newInvite('async', 1);
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await show();
    expect(screen.getByRole('header', { name: 'Οι προσκλήσεις σου' })).toBeOnTheScreen();
    const row = screen.getByRole('button', {
      name: 'Πρόσκληση, Πόρτες, έως 1 βαθμό, Χαλαρά, Λήγει σε 24 ώρες',
    });
    expect(within(row).getByText('Πόρτες · έως 1 βαθμό')).toBeOnTheScreen();
    expect(within(row).getByText(`Κωδικός ${code}`)).toBeOnTheScreen();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });
});
