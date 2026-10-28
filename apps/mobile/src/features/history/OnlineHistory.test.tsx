/**
 * The "Online" section of History (#313), on the Jest online fake: one
 * in-memory server, and `auth` / `games` as the signed-in user.
 */
import type { GameTransport } from '@tavli/contracts';
import { act, render, screen, within } from '@testing-library/react-native';

import { gamePreset } from '@/features/match/setup';
import { hasOnlineAccount, rememberOnlineAccount } from '@/features/online/accountHint';
import i18n from '@/i18n';
import { auth, games } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { onlineFake } from '../../../test/onlineFake';

import { HistoryScreen } from './HistoryScreen';
import { OnlineHistory } from './OnlineHistory';
import type { HistoryRecord } from './records';
import { historyStore } from './store';

runOnFakeTimers();

const ME = 'guest-1';
const FRIEND = 'bob';
const OCT_28 = Date.UTC(2026, 9, 28, 12);

const RECORD: HistoryRecord = {
  id: 'r',
  endedAt: Date.UTC(2026, 9, 27, 12),
  mode: 'bot',
  game: 'portes',
  botLevel: 'easy',
  names: { white: '', black: '' },
  targetPoints: 3,
  score: { white: 3, black: 1 },
  end: 'finished',
  winner: 'white',
  resignedBy: null,
  timedOutBy: null,
  games: 4,
  diploWins: { white: 1, black: 0 },
  draws: 0,
  matchNumber: 1,
  openingRoll: 'useOpeningDice',
  preset: gamePreset('portes'),
};

function signIn(): void {
  onlineFake.authStore.session = { id: ME, isGuest: true };
}

/** A new game of mine (I am White), one second after the last change. */
function newGame(choice: 'portes' | 'plakoto' = 'portes', points = 5): string {
  jest.advanceTimersByTime(1000);
  return onlineFake.server().createGame(ME, { white: ME, black: FRIEND }, choice, points, 'async');
}

/** A finished match: `loser` resigns it. */
async function finished(loser: string, choice: 'portes' | 'plakoto' = 'portes'): Promise<string> {
  const gameId = newGame(choice);
  jest.advanceTimersByTime(1000);
  await onlineFake.transportFor(loser).resign(gameId);
  return gameId;
}

/** Lets the server answer (it answers on later microtasks). */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

async function show(records: readonly HistoryRecord[] = [RECORD], transport = games) {
  await render(
    <HistoryScreen
      records={records}
      onPlay={jest.fn()}
      online={(onMatches) => <OnlineHistory auth={auth} games={transport} onMatches={onMatches} />}
    />,
  );
  await flush();
}

/** The game ids of the online rows, top to bottom. */
function rowIds(): string[] {
  return screen
    .queryAllByTestId(/^history-online-/)
    .map((row) => String(row.props.testID).replace('history-online-', ''));
}

beforeEach(async () => {
  jest.setSystemTime(OCT_28);
  await act(async () => historyStore.getState().clear());
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('<OnlineHistory />', () => {
  it('a phone with no online account shows no section and makes no call', async () => {
    signIn();
    await finished(FRIEND);
    const ready = jest.spyOn(onlineFake.auth, 'ready');
    const watch = jest.spyOn(onlineFake.games, 'watchMyGames');
    await show();
    expect(screen.getByTestId('history-row-0')).toBeOnTheScreen();
    expect(screen.queryByTestId('history-online')).toBeNull();
    expect(ready).not.toHaveBeenCalled();
    expect(watch).not.toHaveBeenCalled();
    expect(onlineFake.authStore.guests).toBe(0);
    ready.mockRestore();
    watch.mockRestore();
  });

  it('shows nothing in a build with no online server', async () => {
    signIn();
    rememberOnlineAccount();
    await finished(FRIEND);
    await render(
      <HistoryScreen
        records={[RECORD]}
        onPlay={jest.fn()}
        online={(onMatches) => (
          <OnlineHistory auth={undefined} games={undefined} onMatches={onMatches} />
        )}
      />,
    );
    await flush();
    expect(screen.queryByTestId('history-online')).toBeNull();
  });

  it('lists the finished matches newest first, with the winner, and no tap', async () => {
    signIn();
    rememberOnlineAccount();
    const won = await finished(FRIEND);
    const lost = await finished(ME, 'plakoto');
    // A match still in play stays on Home.
    const active = newGame();
    const watch = jest.spyOn(onlineFake.games, 'watchMyGames');
    await show();
    expect(watch).toHaveBeenCalledWith(
      { status: 'finished' },
      expect.any(Function),
      expect.any(Function),
    );
    watch.mockRestore();
    expect(screen.getByRole('header', { name: 'Online' })).toBeOnTheScreen();
    expect(rowIds()).toEqual([lost, won]);
    expect(rowIds()).not.toContain(active);
    const lostRow = screen.getByTestId(`history-online-${lost}`);
    expect(lostRow).toHaveAccessibleName(
      'Plakoto vs friend, 0 to 0, first to 5, Your friend won, Oct 28, 2026',
    );
    expect(within(lostRow).getByText('Your friend won')).toBeOnTheScreen();
    expect(within(lostRow).getByText('0–0 · first to 5')).toBeOnTheScreen();
    const wonRow = screen.getByTestId(`history-online-${won}`);
    expect(wonRow).toHaveAccessibleName(
      'Portes vs friend, 0 to 0, first to 5, You won, Oct 28, 2026',
    );
    expect(within(wonRow).getByText('You won')).toBeOnTheScreen();
    // History opens no game: a row is no button.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(onlineFake.authStore.guests).toBe(0);
  });

  it('keeps the local stats and history as they were', async () => {
    signIn();
    rememberOnlineAccount();
    await finished(FRIEND);
    await finished(ME);
    await show();
    expect(rowIds()).toHaveLength(2);
    expect(screen.getByTestId('history-stats-portes-easy')).toHaveAccessibleName(
      'Bot · Easy, Played 1, Won 1, Lost 0, Win rate 100%, Diplo wins 1, Draws 0',
    );
    expect(screen.queryByTestId('history-row-1')).toBeNull();
    expect(historyStore.getState().records).toEqual([]);
  });

  it('with no local record but an online match, shows no empty state', async () => {
    signIn();
    rememberOnlineAccount();
    const won = await finished(FRIEND);
    const watch = jest.spyOn(onlineFake.games, 'watchMyGames');
    await show([]);
    expect(screen.queryByText('No matches yet')).toBeNull();
    expect(screen.queryByTestId('history-play')).toBeNull();
    expect(screen.queryByRole('header', { name: 'Stats' })).toBeNull();
    expect(rowIds()).toEqual([won]);
    // The section kept its place: one watch only.
    expect(watch).toHaveBeenCalledTimes(1);
    watch.mockRestore();
  });

  it('with no local record and no online account, shows the empty state', async () => {
    signIn();
    await finished(FRIEND);
    await show([]);
    expect(screen.getByRole('header', { name: 'No matches yet' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play' })).toBeOnTheScreen();
    expect(screen.queryByTestId('history-online')).toBeNull();
  });

  it('shows the empty state again after a sign-out', async () => {
    signIn();
    rememberOnlineAccount();
    await finished(FRIEND);
    await show([]);
    expect(screen.queryByText('No matches yet')).toBeNull();
    await act(async () => {
      await auth!.signOut();
    });
    await flush();
    expect(screen.getByRole('header', { name: 'No matches yet' })).toBeOnTheScreen();
  });

  it('shows no section when no online match has finished', async () => {
    signIn();
    rememberOnlineAccount();
    newGame();
    await show();
    expect(screen.queryByTestId('history-online')).toBeNull();
    // With no local record either: the empty state.
    await screen.unmount();
    await show([]);
    expect(screen.getByRole('header', { name: 'No matches yet' })).toBeOnTheScreen();
  });

  it('says when the list did not load; Try again loads it', async () => {
    signIn();
    rememberOnlineAccount();
    const won = await finished(FRIEND);
    let offline = true;
    const flaky: GameTransport = {
      ...games!,
      watchMyGames(request, onList, onError) {
        if (!offline) return games!.watchMyGames(request, onList, onError);
        void Promise.resolve().then(() => onError?.(new Error('network request failed')));
        return () => undefined;
      },
    };
    const user = setupUser();
    await show([RECORD], flaky);
    expect(screen.getByRole('header', { name: 'Online' })).toBeOnTheScreen();
    expect(
      screen.getByText('Your online games did not load. Check the connection.'),
    ).toBeOnTheScreen();
    expect(rowIds()).toEqual([]);
    offline = false;
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    await flush();
    expect(rowIds()).toEqual([won]);
    expect(screen.queryByTestId('online-games-failed')).toBeNull();
  });

  it('keeps the list when the connection fails later', async () => {
    signIn();
    rememberOnlineAccount();
    const won = await finished(FRIEND);
    let fail: ((error: unknown) => void) | undefined;
    const losing: GameTransport = {
      ...games!,
      watchMyGames(request, onList, onError) {
        fail = onError;
        return games!.watchMyGames(request, onList);
      },
    };
    await show([RECORD], losing);
    await act(async () => fail?.(new Error('connection lost')));
    expect(rowIds()).toEqual([won]);
    expect(
      screen.getByText('This list may be out of date. Check the connection.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('says it did not load when the session does not load, and keeps the note', async () => {
    // Better Auth's ready() gives null with no network too: no sign-out.
    rememberOnlineAccount();
    await show();
    expect(
      screen.getByText('Your online games did not load. Check the connection.'),
    ).toBeOnTheScreen();
    expect(hasOnlineAccount()).toBe(true);
    expect(onlineFake.authStore.guests).toBe(0);
  });

  it('hides the section after a sign-out', async () => {
    signIn();
    rememberOnlineAccount();
    await finished(FRIEND);
    await show();
    expect(screen.getByTestId('history-online')).toBeOnTheScreen();
    await act(async () => {
      await auth!.signOut();
    });
    await flush();
    expect(screen.queryByTestId('history-online')).toBeNull();
    expect(hasOnlineAccount()).toBe(false);
  });

  it('speaks Greek', async () => {
    signIn();
    rememberOnlineAccount();
    const won = await finished(FRIEND);
    const lost = await finished(ME);
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await show();
    expect(screen.getByRole('header', { name: 'Online' })).toBeOnTheScreen();
    expect(screen.getByTestId(`history-online-${won}`)).toHaveAccessibleName(
      /^Πόρτες με φίλο, 0 προς 0, στους 5, Κέρδισες, 28 Οκτ 2026$/,
    );
    expect(screen.getByTestId(`history-online-${lost}`)).toHaveAccessibleName(
      /^Πόρτες με φίλο, 0 προς 0, στους 5, Κέρδισε ο φίλος σου, /,
    );
  });
});
