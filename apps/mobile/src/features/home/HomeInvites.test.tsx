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
const HOUR = 60 * MINUTE;

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

/**
 * The phone clock runs `ms` ahead of the server: the port gives the
 * server's times that much earlier than the phone reads them.
 */
function serverBehind(ms: number): Invites {
  return {
    ...invites!,
    watchMyInvites(onList, onError) {
      return invites!.watchMyInvites(
        (list) => onList(list.map((view) => ({ ...view, expiresAt: view.expiresAt - ms }))),
        onError,
      );
    },
  };
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

  it('keeps an invite until the server drops it, and says "Expiring now" when the phone says the time is up', async () => {
    signIn();
    const code = newInvite();
    await show();
    expect(rowCodes()).toEqual([code]);
    // Nearly a day later: the server has not marked it (no runDueTimeouts).
    await act(async () => {
      jest.setSystemTime(Date.now() + INVITE_TIME_MS - 2 * MINUTE);
      jest.advanceTimersByTime(30_000);
    });
    expect(
      within(screen.getByTestId(`home-invite-${code}`)).getByText('Live · 2 min left'),
    ).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(2 * MINUTE);
    });
    const row = screen.getByTestId(`home-invite-${code}`);
    expect(row).toHaveAccessibleName('Invite, Portes, first to 3 points, Live, Expiring now');
    expect(within(row).getByText('Live · Expiring now')).toBeOnTheScreen();
    // The server marks it expired: the list drops it.
    await act(async () => {
      onlineFake.server().runDueTimeouts();
    });
    await flush();
    expect(screen.queryByTestId('home-invites')).toBeNull();
  });

  it('a phone clock 2 h fast keeps an invite the server still lists, and it opens', async () => {
    signIn();
    const code = newInvite();
    const user = setupUser();
    const { onOpen } = await show(serverBehind(2 * HOUR));
    expect(
      within(screen.getByTestId(`home-invite-${code}`)).getByText('Live · 22 h left'),
    ).toBeOnTheScreen();
    // The server has an hour left; on the phone the time was up an hour ago.
    await act(async () => {
      jest.setSystemTime(Date.now() + INVITE_TIME_MS - HOUR);
      jest.advanceTimersByTime(30_000);
    });
    await flush();
    expect(onlineFake.server().getInvite(code)?.status).toBe('open');
    const row = screen.getByTestId(`home-invite-${code}`);
    expect(within(row).getByText('Live · Expiring now')).toBeOnTheScreen();
    await user.press(row);
    expect(onOpen).toHaveBeenCalledWith(code);
  });

  it('reads the phone clock again when Home comes back into view', async () => {
    signIn();
    const code = newInvite();
    const props = { auth: auth!, invites: invites!, onOpen: jest.fn() };
    const view = await render(<HomeInvites {...props} focused />);
    await flush();
    await view.rerender(<HomeInvites {...props} focused={false} />);
    // Two hours away from Home: no clock ticks then.
    await act(async () => {
      jest.setSystemTime(Date.now() + 2 * HOUR);
    });
    await view.rerender(<HomeInvites {...props} focused />);
    // At once, before any timer runs.
    expect(
      within(screen.getByTestId(`home-invite-${code}`)).getByText('Live · 22 h left'),
    ).toBeOnTheScreen();
  });

  it('a new list reads the phone clock, also when the clock has not ticked', async () => {
    signIn();
    const old = newInvite();
    const props = { auth: auth!, invites: invites!, onOpen: jest.fn() };
    const view = await render(<HomeInvites {...props} focused />);
    await flush();
    await view.rerender(<HomeInvites {...props} focused={false} />);
    await act(async () => {
      jest.setSystemTime(Date.now() + 2 * HOUR);
    });
    onlineFake.server().createInvite(ME, 'portes', 3, 'live');
    await flush();
    expect(rowCodes()).toHaveLength(2);
    expect(
      within(screen.getByTestId(`home-invite-${old}`)).getByText('Live · 22 h left'),
    ).toBeOnTheScreen();
  });

  it('a session that does not load shows the note, keeps the flag and makes no guest', async () => {
    // Better Auth's ready() gives null with no network too: no sign-out.
    rememberOnlineAccount();
    newInvite();
    await show();
    expect(screen.getByTestId('home-invites-failed')).toBeOnTheScreen();
    expect(screen.queryAllByTestId(/^home-invite-/)).toEqual([]);
    expect(onlineFake.authStore.guests).toBe(0);
    expect(hasOnlineAccount()).toBe(true);
  });

  it('a list that does not load shows a note, and Try again loads it', async () => {
    signIn();
    const code = newInvite();
    let calls = 0;
    const flaky: Invites = {
      ...invites!,
      watchMyInvites(onList, onError) {
        calls += 1;
        if (calls === 1) {
          void Promise.resolve().then(() => onError?.(new Error('network request failed')));
          return () => undefined;
        }
        return invites!.watchMyInvites(onList, onError);
      },
    };
    const user = setupUser();
    await show(flaky);
    expect(screen.getByRole('header', { name: 'Your invites' })).toBeOnTheScreen();
    expect(screen.getByText('Your invites did not load. Check the connection.')).toBeOnTheScreen();
    expect(rowCodes()).toEqual([]);
    await user.press(screen.getByRole('button', { name: 'Try again, Your invites' }));
    await flush();
    expect(calls).toBe(2);
    expect(rowCodes()).toEqual([code]);
    expect(screen.queryByTestId('home-invites-failed')).toBeNull();
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
      jest.setSystemTime(Date.now() + INVITE_TIME_MS);
      jest.advanceTimersByTime(30_000);
    });
    expect(within(row).getByText('Χαλαρά · Λήγει τώρα')).toBeOnTheScreen();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });
});
