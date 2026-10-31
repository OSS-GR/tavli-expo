/**
 * The waiting screen of the inviter (#281) on its own in-memory server:
 * the code and link, Share, Cancel, the friend's answer seen live, the
 * expiry, errors, screen readers and Greek.
 */
import { INVITE_TIME_MS, type Invites } from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import { createMemoryGameServer } from '@tavli/online';
import { act, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Share } from 'react-native';

import i18n from '@/i18n';

import { InviteWaitScreen, JOINED_OPEN_MS } from './InviteWaitScreen';
import { waitStateOfCancelError, waitStateOfError, waitStateOfView } from './waitState';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { renderWithRoot } from '../../../test/render';

const ME = 'me';
const FRIEND = 'friend';
const START = Date.UTC(2026, 9, 28, 12, 0, 0);

runOnFakeTimers();

afterAll(async () => {
  await i18n.changeLanguage('en');
});

/** A server whose clock the test moves by hand, and an invite from this phone. */
function setup() {
  let clock = START;
  const server = createMemoryGameServer({ rng: createSeededRng(3), now: () => clock });
  const code = server.createInvite(ME, 'portes', 3, 1);
  return {
    server,
    code,
    mine: server.invitesFor(ME),
    friend: server.invitesFor(FRIEND),
    /** Moves the server clock and runs its timers, like Convex's scheduled expiry. */
    passTime: (ms: number) => {
      clock += ms;
      server.runDueTimeouts();
    },
  };
}

async function openWait(code: string, invites: Invites, me: string | null | undefined = ME) {
  const props = {
    onGame: jest.fn<void, [string]>(),
    onNewInvite: jest.fn(),
    onHome: jest.fn(),
  };
  const view = await renderWithRoot(
    <InviteWaitScreen code={code} me={me} invites={invites} {...props} />,
  );
  return { ...props, ...view };
}

/** Lets the server's later microtasks (views, answers) run. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

describe('InviteWaitScreen', () => {
  it('shows the code and the link while it waits, and reads them once', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { code, mine } = setup();
    await openWait(code, mine);
    expect(await screen.findByRole('header', { name: 'Send the invite' })).toBeOnTheScreen();
    expect(screen.getByTestId('invite-wait-code')).toHaveTextContent(code);
    expect(screen.getByTestId('invite-wait-link')).toHaveTextContent(`tavlaki://invite/${code}`);
    expect(screen.getByText('Waiting for your friend…')).toBeOnTheScreen();
    // The code is spelled out for a screen reader.
    expect(screen.getByLabelText(`Code: ${[...code].join(' ')}`)).toBeOnTheScreen();
    expect(announce).toHaveBeenLastCalledWith(
      'Send the invite Send this link to a friend. The game starts when they accept.',
    );
    announce.mockRestore();
  });

  it('Share opens the share sheet with the link and the code', async () => {
    const user = setupUser();
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    const { code, mine, server } = setup();
    await openWait(code, mine);
    await user.press(await screen.findByRole('button', { name: 'Share the invite' }));
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({
      message: `Play tavli with me on Tavlaki. Open this link to join: tavlaki://invite/${code} (code ${code})`,
    });
    // Sharing does not change the invite.
    expect(server.getInvite(code)?.status).toBe('open');
    share.mockRestore();
  });

  it('a share sheet that fails leaves the screen as it is', async () => {
    const user = setupUser();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const share = jest.spyOn(Share, 'share').mockRejectedValue(new Error('no share sheet'));
    const { code, mine } = setup();
    await openWait(code, mine);
    await user.press(await screen.findByRole('button', { name: 'Share the invite' }));
    await flush();
    expect(screen.getByRole('header', { name: 'Send the invite' })).toBeOnTheScreen();
    share.mockRestore();
    warn.mockRestore();
  });

  it('sees the accept live, says "Your friend joined", then opens the game once', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { code, mine, friend } = setup();
    const { onGame } = await openWait(code, mine);
    await screen.findByRole('header', { name: 'Send the invite' });

    let gameId = '';
    await act(async () => {
      gameId = await friend.acceptInvite(code);
    });
    await flush();
    expect(screen.getByRole('header', { name: 'Your friend joined' })).toBeOnTheScreen();
    expect(announce).toHaveBeenLastCalledWith('Your friend joined The game opens now.');
    expect(onGame).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(JOINED_OPEN_MS - 1);
    });
    expect(onGame).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(onGame).toHaveBeenCalledWith(gameId);
    await act(async () => {
      jest.advanceTimersByTime(JOINED_OPEN_MS * 2);
    });
    expect(onGame).toHaveBeenCalledTimes(1);
    announce.mockRestore();
  });

  it('"Open the game" opens it at once, and the timer does not open it again', async () => {
    const user = setupUser();
    const { code, mine, friend } = setup();
    const { onGame } = await openWait(code, mine);
    await screen.findByRole('header', { name: 'Send the invite' });
    await act(async () => {
      await friend.acceptInvite(code);
    });
    await flush();
    await user.press(screen.getByRole('button', { name: 'Open the game' }));
    expect(onGame).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(JOINED_OPEN_MS);
    });
    expect(onGame).toHaveBeenCalledTimes(1);
  });

  it('Cancel takes the invite back and goes Home, with no "cancelled" card on the way', async () => {
    const user = setupUser();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { code, mine, server } = setup();
    // The watch sees the cancel before Cancel answers, like Convex.
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const invites: Invites = {
      ...mine,
      cancelInvite: async (text) => {
        await mine.cancelInvite(text);
        await held;
      },
    };
    const { onHome } = await openWait(code, invites);
    await user.press(await screen.findByRole('button', { name: 'Cancel the invite' }));
    await flush();
    expect(server.getInvite(code)?.status).toBe('cancelled');
    expect(screen.queryByTestId('invite-wait-cancelled')).toBeNull();
    expect(onHome).not.toHaveBeenCalled();
    await act(async () => release());
    await flush();
    expect(onHome).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('invite-wait-cancelled')).toBeNull();
    expect(announce).not.toHaveBeenCalledWith(expect.stringContaining('The invite is cancelled'));
    announce.mockRestore();
  });

  it('a Cancel that fails after the invite was cancelled elsewhere shows "cancelled"', async () => {
    const user = setupUser();
    const { code, mine } = setup();
    const invites: Invites = {
      ...mine,
      // Another screen cancelled it just before: this Cancel gets INVITE_CLOSED.
      cancelInvite: async (text) => {
        await mine.cancelInvite(text);
        return await mine.cancelInvite(text);
      },
    };
    const { onHome } = await openWait(code, invites);
    await user.press(await screen.findByRole('button', { name: 'Cancel the invite' }));
    await flush();
    expect(screen.getByRole('header', { name: 'The invite is cancelled' })).toBeOnTheScreen();
    expect(screen.queryByTestId('invite-wait-cancel-failed')).toBeNull();
    expect(onHome).not.toHaveBeenCalled();
  });

  it('screen readers: focus moves to the title of each card', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    const { code, mine, friend } = setup();
    await openWait(code, mine);
    await screen.findByRole('header', { name: 'Send the invite' });
    const opened = focus.mock.calls.length;
    expect(focus).toHaveBeenLastCalledWith(expect.anything(), 'focus');
    await act(async () => {
      await friend.acceptInvite(code);
    });
    await flush();
    expect(screen.getByRole('header', { name: 'Your friend joined' })).toBeOnTheScreen();
    expect(focus.mock.calls.length).toBeGreaterThan(opened);
    expect(focus).toHaveBeenLastCalledWith(expect.anything(), 'focus');
    focus.mockRestore();
  });

  it('a Cancel that does not reach the server says so, and keeps the invite', async () => {
    const user = setupUser();
    const { code, mine, server } = setup();
    const invites: Invites = {
      ...mine,
      cancelInvite: () => Promise.reject(new Error('offline')),
    };
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { onHome } = await openWait(code, invites);
    await user.press(await screen.findByRole('button', { name: 'Cancel the invite' }));
    await flush();
    const text = 'The invite was not cancelled. Check the connection and try again.';
    expect(screen.getByText(text)).toBeOnTheScreen();
    // Read out: iOS VoiceOver does not read alert roles.
    expect(announce).toHaveBeenLastCalledWith(text);
    announce.mockRestore();
    expect(screen.getByRole('button', { name: 'Cancel the invite' })).toBeEnabled();
    expect(server.getInvite(code)?.status).toBe('open');
    expect(onHome).not.toHaveBeenCalled();
  });

  it('a Cancel just after the friend accepted shows no error: the watch shows the game', async () => {
    const user = setupUser();
    const { code, mine, friend } = setup();
    // The friend accepts between the last view and the tap: the watch
    // shows the answer only once the cancel has failed.
    let shown = 0;
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const invites: Invites = {
      ...mine,
      watchInvite: (text, onView, onError) =>
        mine.watchInvite(
          text,
          (view) => {
            shown += 1;
            if (shown === 1) onView(view);
            else void held.then(() => onView(view));
          },
          onError,
        ),
      cancelInvite: (text) =>
        mine.cancelInvite(text).finally(() => {
          release();
        }),
    };
    const { onHome } = await openWait(code, invites);
    await screen.findByRole('header', { name: 'Send the invite' });
    await act(async () => {
      await friend.acceptInvite(code);
    });
    await flush();
    expect(screen.getByRole('header', { name: 'Send the invite' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Cancel the invite' }));
    await flush();
    expect(screen.queryByTestId('invite-wait-cancel-failed')).toBeNull();
    expect(screen.getByRole('header', { name: 'Your friend joined' })).toBeOnTheScreen();
    expect(onHome).not.toHaveBeenCalled();
  });

  it('shows "said no" when the friend declines, with a new invite and Home', async () => {
    const user = setupUser();
    const { code, mine, friend } = setup();
    const { onNewInvite, onHome } = await openWait(code, mine);
    await screen.findByRole('header', { name: 'Send the invite' });
    await act(async () => {
      await friend.declineInvite(code);
    });
    await flush();
    expect(screen.getByRole('header', { name: 'Your friend said no' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Make a new invite' }));
    expect(onNewInvite).toHaveBeenCalledTimes(1);
    await user.press(screen.getByRole('button', { name: 'Home' }));
    expect(onHome).toHaveBeenCalledTimes(1);
  });

  it('shows "expired" when nobody answers within 24 hours', async () => {
    const { code, mine, passTime } = setup();
    await openWait(code, mine);
    await screen.findByRole('header', { name: 'Send the invite' });
    await act(async () => passTime(INVITE_TIME_MS - 1));
    await flush();
    expect(screen.getByRole('header', { name: 'Send the invite' })).toBeOnTheScreen();
    await act(async () => passTime(1));
    await flush();
    expect(screen.getByRole('header', { name: 'The invite expired' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Make a new invite' })).toBeOnTheScreen();
  });

  it('shows "not found" for a code that is no invite', async () => {
    const { mine } = setup();
    await openWait('ABCD2345', mine);
    expect(await screen.findByRole('header', { name: 'Invite not found' })).toBeOnTheScreen();
  });

  it('shows "not found" for someone else\'s invite, with no Share or Cancel', async () => {
    const { server } = setup();
    const theirs = server.createInvite(FRIEND, 'portes', 3, 1);
    await openWait(theirs, server.invitesFor(ME));
    expect(await screen.findByRole('header', { name: 'Invite not found' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Cancel the invite' })).toBeNull();
    expect(server.getInvite(theirs)?.status).toBe('open');
  });

  it('with nobody signed in shows "not found" and never calls the server', async () => {
    const { code, mine } = setup();
    const watchInvite = jest.fn(mine.watchInvite);
    await openWait(code, { ...mine, watchInvite }, null);
    expect(await screen.findByRole('header', { name: 'Invite not found' })).toBeOnTheScreen();
    expect(watchInvite).not.toHaveBeenCalled();
  });

  it('waits for the saved session before it watches', async () => {
    const { code, mine } = setup();
    const watchInvite = jest.fn(mine.watchInvite);
    const invites = { ...mine, watchInvite };
    const props = { onGame: jest.fn(), onNewInvite: jest.fn(), onHome: jest.fn() };
    const view = await renderWithRoot(
      <InviteWaitScreen code={code} me={undefined} invites={invites} {...props} />,
    );
    expect(screen.getByText('Loading the invite…')).toBeOnTheScreen();
    expect(watchInvite).not.toHaveBeenCalled();
    await view.rerender(<InviteWaitScreen code={code} me={ME} invites={invites} {...props} />);
    expect(await screen.findByRole('header', { name: 'Send the invite' })).toBeOnTheScreen();
    expect(watchInvite).toHaveBeenCalledTimes(1);
  });

  it('a watch that fails shows "did not load"; Try again watches again', async () => {
    const user = setupUser();
    const { code, mine } = setup();
    let fail = true;
    const invites: Invites = {
      ...mine,
      watchInvite: (text, onView, onError) => {
        if (!fail) return mine.watchInvite(text, onView, onError);
        void Promise.resolve().then(() => onError?.(new Error('offline')));
        return () => {};
      },
    };
    await openWait(code, invites);
    expect(
      await screen.findByRole('header', { name: 'The invite did not load' }),
    ).toBeOnTheScreen();
    fail = false;
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('header', { name: 'Send the invite' })).toBeOnTheScreen();
  });

  it('stops watching once the invite is answered, and when the screen closes', async () => {
    const { code, mine, friend } = setup();
    const stops: number[] = [];
    const invites: Invites = {
      ...mine,
      watchInvite: (text, onView, onError) => {
        const stop = mine.watchInvite(text, onView, onError);
        return () => {
          stops.push(1);
          stop();
        };
      },
    };
    const first = await openWait(code, invites);
    await screen.findByRole('header', { name: 'Send the invite' });
    await first.unmount();
    expect(stops).toHaveLength(1);

    await openWait(code, invites);
    await screen.findByRole('header', { name: 'Send the invite' });
    await act(async () => {
      await friend.declineInvite(code);
    });
    await flush();
    expect(stops).toHaveLength(2);
  });

  it('shows Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    const { code, mine } = setup();
    await openWait(code, mine);
    expect(await screen.findByRole('header', { name: 'Στείλε την πρόσκληση' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Μοιράσου την πρόσκληση' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ακύρωσε την πρόσκληση' })).toBeOnTheScreen();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });
});

describe('waitState', () => {
  const view = {
    code: 'ABCD2345',
    from: ME,
    choice: 'portes',
    targetPoints: 3,
    turnTimeMinutes: 1,
    status: 'open',
    expiresAt: START + INVITE_TIME_MS,
    gameId: null,
  } as const;

  it('turns each view into a state', () => {
    expect(waitStateOfView(null, ME)).toEqual({ kind: 'notFound' });
    expect(waitStateOfView(view, ME)).toEqual({ kind: 'open', view });
    expect(waitStateOfView({ ...view, status: 'accepted', gameId: 'game-1' }, ME)).toEqual({
      kind: 'joined',
      gameId: 'game-1',
    });
    expect(waitStateOfView({ ...view, status: 'accepted' }, ME)).toEqual({ kind: 'failed' });
    expect(waitStateOfView({ ...view, status: 'declined' }, ME)).toEqual({ kind: 'declined' });
    expect(waitStateOfView({ ...view, status: 'cancelled' }, ME)).toEqual({ kind: 'cancelled' });
    expect(waitStateOfView({ ...view, status: 'expired' }, ME)).toEqual({ kind: 'expired' });
    // Someone else's invite is not this phone's to wait for.
    expect(waitStateOfView(view, FRIEND)).toEqual({ kind: 'notFound' });
    expect(waitStateOfView({ ...view, status: 'accepted', gameId: 'game-1' }, FRIEND)).toEqual({
      kind: 'notFound',
    });
  });

  it('turns errors into states', () => {
    const error = (code: string) => ({ code, message: code });
    expect(waitStateOfError(error('NOT_SIGNED_IN'))).toEqual({ kind: 'notFound' });
    expect(waitStateOfError(new Error('offline'))).toEqual({ kind: 'failed' });
    expect(waitStateOfCancelError(error('INVITE_EXPIRED'))).toEqual({ kind: 'expired' });
    expect(waitStateOfCancelError(error('NOT_YOUR_INVITE'))).toEqual({ kind: 'notFound' });
    expect(waitStateOfCancelError(error('INVITE_CLOSED'))).toBeNull();
    expect(waitStateOfCancelError(new Error('offline'))).toBeNull();
  });
});
