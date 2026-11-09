/**
 * Report or block (#435), on the Jest online fake: the dialog calls
 * `Safety` as the signed-in user on the in-memory server.
 */
import type { Safety } from '@tavli/contracts';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import i18n from '@/i18n';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { onlineFake } from '../../../test/onlineFake';

import { markBlocked, useIsBlocked } from './blocked';
import { ReportOrBlockSheet, SENDING_HOLD_MS, type SafetyPlayer } from './ReportOrBlock';

runOnFakeTimers();

const ME = 'guest-1';
const FRIEND = 'bob';

/** Signs me in, with one game against the friend: we met, so a block is allowed. */
function meetFriend(): SafetyPlayer {
  onlineFake.authStore.session = { id: ME, isGuest: true };
  onlineFake.server().createGame(ME, { white: ME, black: FRIEND }, 'portes', 3, null);
  return { id: FRIEND, name: onlineFake.server().nameOf(FRIEND) };
}

/** Lets the server answer (it answers on later microtasks). */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

async function show(player: SafetyPlayer, safety: Safety = onlineFake.safety) {
  const onClose = jest.fn();
  await render(<ReportOrBlockSheet me={ME} player={player} safety={safety} onClose={onClose} />);
  return onClose;
}

const blockedIds = async () =>
  (await onlineFake.server().safetyFor(ME).listBlocked()).map((p) => p.playerId);

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('<ReportOrBlock />', () => {
  it('blocks after a short confirm, and says how to unblock', async () => {
    const player = meetFriend();
    const name = `Guest ${onlineFake.guestNumber(FRIEND)}`;
    const onClose = await show(player);
    const user = setupUser();
    expect(screen.getByRole('header', { name: `Report or block ${name}` })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: `Block ${name}` }));
    expect(screen.getByRole('header', { name: `Block ${name}?` })).toBeOnTheScreen();
    expect(await blockedIds()).toEqual([]);
    await user.press(screen.getByTestId('safety-block-yes'));
    await flush();
    expect(screen.getByRole('header', { name: 'Player blocked' })).toBeOnTheScreen();
    expect(screen.getByText(/Settings → Blocked players/)).toBeOnTheScreen();
    expect(await blockedIds()).toEqual([FRIEND]);
    expect(onlineFake.server().reportsOf()).toEqual([]);
    await user.press(screen.getByTestId('safety-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reports with a reason from the list, and the report blocks too', async () => {
    const player = meetFriend();
    await show(player);
    const user = setupUser();
    await user.press(screen.getByTestId('safety-report'));
    expect(screen.getByTestId('safety-reasons')).toBeOnTheScreen();
    for (const label of [
      'Offensive name',
      'Cheating or abuse of the game',
      'Harassment',
      'Something else',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeOnTheScreen();
    }
    await user.press(screen.getByRole('button', { name: 'Harassment' }));
    await flush();
    expect(screen.getByRole('header', { name: 'Thank you for the report' })).toBeOnTheScreen();
    expect(onlineFake.server().reportsOf()).toEqual([
      expect.objectContaining({ reporterId: ME, reportedId: FRIEND, reason: 'harassment' }),
    ]);
    expect(await blockedIds()).toEqual([FRIEND]);
  });

  it('Cancel sends nothing', async () => {
    const player = meetFriend();
    const onClose = await show(player);
    const user = setupUser();
    await user.press(screen.getByTestId('safety-report'));
    await user.press(screen.getByTestId('safety-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onlineFake.server().reportsOf()).toEqual([]);
    expect(await blockedIds()).toEqual([]);
  });

  it('names a player with no name "this player"', async () => {
    meetFriend();
    await show({ id: FRIEND, name: null });
    expect(screen.getByRole('header', { name: 'Report or block this player' })).toBeOnTheScreen();
  });

  it('moves screen reader focus to the title of each step', async () => {
    const player = meetFriend();
    const name = `Guest ${onlineFake.guestNumber(FRIEND)}`;
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    // The text of the view that got focus last.
    const focused = () => {
      const call = focus.mock.calls.findLast(([, event]) => event === 'focus');
      return (call?.[0] as unknown as { props?: { children?: unknown } } | undefined)?.props
        ?.children;
    };
    await show(player);
    const user = setupUser();
    expect(focused()).toBe(`Report or block ${name}`);
    await user.press(screen.getByTestId('safety-block'));
    expect(focused()).toBe(`Block ${name}?`);
    await user.press(screen.getByTestId('safety-block-yes'));
    await flush();
    expect(focused()).toBe('Player blocked');
    focus.mockRestore();
  });

  it('a player we never met: says the account is gone, with no Try again', async () => {
    onlineFake.authStore.session = { id: ME, isGuest: true };
    await show({ id: 'stranger', name: null });
    const user = setupUser();
    await user.press(screen.getByTestId('safety-block'));
    await user.press(screen.getByTestId('safety-block-yes'));
    await flush();
    expect(screen.getByRole('header', { name: 'That did not work' })).toBeOnTheScreen();
    expect(screen.getByText("This player's account is gone.")).toBeOnTheScreen();
    expect(screen.queryByTestId('safety-retry')).toBeNull();
  });

  it('a failed call can be tried again', async () => {
    const player = meetFriend();
    const report = jest
      .fn<ReturnType<Safety['report']>, Parameters<Safety['report']>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementation((request) => onlineFake.safety.report(request));
    await show(player, { ...onlineFake.safety, report });
    const user = setupUser();
    await user.press(screen.getByTestId('safety-report'));
    await user.press(screen.getByTestId('safety-reason-cheating'));
    await flush();
    expect(screen.getByText('Check the connection and try again.')).toBeOnTheScreen();
    await user.press(screen.getByTestId('safety-retry'));
    await flush();
    expect(screen.getByTestId('safety-done')).toBeOnTheScreen();
    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenLastCalledWith({ playerId: FRIEND, reason: 'cheating' });
    expect(onlineFake.server().reportsOf()).toHaveLength(1);
  });

  it('a second tap before the screen changes sends one report', async () => {
    const player = meetFriend();
    const report = jest.fn(onlineFake.safety.report);
    await show(player, { ...onlineFake.safety, report });
    const user = setupUser();
    await user.press(screen.getByTestId('safety-report'));
    const reason = screen.getByTestId('safety-reason-cheating');
    await act(async () => {
      void fireEvent.press(reason);
      void fireEvent.press(reason);
    });
    await flush();
    expect(report).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('safety-done')).toBeOnTheScreen();
    expect(onlineFake.server().reportsOf()).toHaveLength(1);
  });

  it('stays open while the call is on its way, and offers Close after a while', async () => {
    const player = meetFriend();
    let answer: () => void = () => {};
    const block = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          answer = resolve;
        }),
    );
    const onClose = await show(player, { ...onlineFake.safety, block });
    const user = setupUser();
    await user.press(screen.getByTestId('safety-block'));
    await user.press(screen.getByTestId('safety-block-yes'));
    expect(screen.getByTestId('safety-sending')).toBeOnTheScreen();
    // A tap outside the dialog (the sheet's close, as Back on Android) does not close it.
    await user.press(screen.getByRole('button', { name: 'Close', includeHiddenElements: true }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByTestId('safety-close')).toBeNull();
    // A phone offline: after a while the dialog says so, and Close works.
    await act(async () => {
      jest.advanceTimersByTime(SENDING_HOLD_MS);
    });
    expect(
      screen.getByText(/Blocked players shows later whether it went through/),
    ).toBeOnTheScreen();
    await user.press(screen.getByTestId('safety-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => {
      answer();
    });
  });

  it('a dialog opened again while the call is on its way follows it: no second call', async () => {
    const player = meetFriend();
    let answer: () => void = () => {};
    const report = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          answer = resolve;
        }),
    );
    const safety = { ...onlineFake.safety, report };
    const first = await render(
      <ReportOrBlockSheet me={ME} player={player} safety={safety} onClose={jest.fn()} />,
    );
    const user = setupUser();
    await user.press(screen.getByTestId('safety-report'));
    await user.press(screen.getByTestId('safety-reason-harassment'));
    await act(async () => {
      jest.advanceTimersByTime(SENDING_HOLD_MS);
    });
    await user.press(screen.getByTestId('safety-close'));
    await first.unmount();
    await render(
      <ReportOrBlockSheet me={ME} player={player} safety={safety} onClose={jest.fn()} />,
    );
    expect(screen.getByTestId('safety-sending')).toBeOnTheScreen();
    await act(async () => {
      answer();
    });
    await flush();
    expect(screen.getByTestId('safety-done')).toBeOnTheScreen();
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('a call that throws at once fails like a rejected one, and lets the sheet close', async () => {
    const player = meetFriend();
    const block = jest.fn(() => {
      throw new Error('broken');
    });
    const onClose = await show(player, { ...onlineFake.safety, block });
    const user = setupUser();
    await user.press(screen.getByTestId('safety-block'));
    await user.press(screen.getByTestId('safety-block-yes'));
    await flush();
    expect(screen.getByTestId('safety-failed')).toBeOnTheScreen();
    // The tap outside the dialog (the first Close) works again.
    const [outside] = screen.getAllByRole('button', { name: 'Close', includeHiddenElements: true });
    await user.press(outside!);
    expect(onClose).toHaveBeenCalled();
  });

  it('a refused call shows a final error, with no Try again', async () => {
    const player = meetFriend();
    const block = jest.fn().mockRejectedValue({ code: 'BAD_REQUEST', message: 'refused' });
    await show(player, { ...onlineFake.safety, block });
    const user = setupUser();
    await user.press(screen.getByTestId('safety-block'));
    await user.press(screen.getByTestId('safety-block-yes'));
    await flush();
    expect(
      screen.getByText('The server did not take this. Close and try later.'),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('safety-retry')).toBeNull();
  });

  it('a player blocked already gets Report only', async () => {
    const player = meetFriend();
    markBlocked(ME, FRIEND);
    const name = `Guest ${onlineFake.guestNumber(FRIEND)}`;
    await show(player);
    expect(screen.getByRole('header', { name: `Report ${name}` })).toBeOnTheScreen();
    expect(screen.queryByTestId('safety-block')).toBeNull();
    expect(screen.queryByTestId('safety-choose')).toBeNull();
  });

  it('a block or a report marks the player blocked for the other screens', async () => {
    const player = meetFriend();
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useIsBlocked(ME, FRIEND));
      return null;
    }
    await render(
      <>
        <Probe />
        <ReportOrBlockSheet
          me={ME}
          player={player}
          safety={onlineFake.safety}
          onClose={jest.fn()}
        />
      </>,
    );
    expect(seen.at(-1)).toBe(false);
    const user = setupUser();
    await user.press(screen.getByTestId('safety-report'));
    await user.press(screen.getByTestId('safety-reason-name'));
    await flush();
    expect(seen.at(-1)).toBe(true);
  });

  it('shows in Greek', async () => {
    const player = meetFriend();
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await show(player);
    expect(screen.getByTestId('safety-choose')).toBeOnTheScreen();
    expect(screen.queryByText(/Report or block/)).toBeNull();
  });
});
