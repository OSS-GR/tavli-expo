/**
 * "Your online games" on Home (#297), on the Jest online fake: one
 * in-memory server, and `auth` / `games` as the signed-in user.
 */
import type { GameTransport, OnlineGameView } from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import { pickTurn } from '@tavli/online/testing';
import { act, render, screen, within } from '@testing-library/react-native';

import { hasOnlineAccount, rememberOnlineAccount } from '@/features/online/accountHint';
import i18n from '@/i18n';
import { auth, games } from '@/services';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { onlineFake } from '../../../test/onlineFake';

import { HomeOnlineGames } from './HomeOnlineGames';

runOnFakeTimers();

const ME = 'guest-1';
const FRIEND = 'bob';

function signIn(): void {
  onlineFake.authStore.session = { id: ME, isGuest: true };
}

/** A new game of mine (I am White), one second after the last change. */
function newGame(pace: 'live' | 'async' = 'async'): string {
  jest.advanceTimersByTime(1000);
  return onlineFake.server().createGame(ME, { white: ME, black: FRIEND }, 'portes', 5, pace);
}

function view(gameId: string): OnlineGameView {
  const game = onlineFake.server().getGame(gameId);
  if (game === null) throw new Error(`no game ${gameId}`);
  return game;
}

function myTurn(gameId: string): boolean {
  return view(gameId).waitingFor === 'white';
}

/** Lets the server answer (it answers on later microtasks). */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

async function show(transport: GameTransport = games!, onOpen = jest.fn(), onSeeAll = jest.fn()) {
  await render(
    <HomeOnlineGames auth={auth!} games={transport} focused onOpen={onOpen} onSeeAll={onSeeAll} />,
  );
  await flush();
  return { onOpen, onSeeAll };
}

/** The game ids of the rows, top to bottom. */
function rowIds(): string[] {
  return screen
    .queryAllByTestId(/^online-game-/)
    .map((row) => String(row.props.testID).replace('online-game-', ''));
}

describe('<HomeOnlineGames />', () => {
  it('shows nothing and makes no guest with no saved session', async () => {
    rememberOnlineAccount();
    newGame();
    await show();
    expect(screen.queryByTestId('home-online-games')).toBeNull();
    expect(onlineFake.authStore.guests).toBe(0);
    // The session is gone: Home stops loading it at start.
    expect(hasOnlineAccount()).toBe(false);
  });

  it('says it is loading until the first list comes', async () => {
    signIn();
    newGame();
    let answer: (() => void) | undefined;
    const slow: GameTransport = {
      ...games!,
      watchMyGames(request, onList, onError) {
        let stop = () => undefined as void;
        answer = () => {
          stop = games!.watchMyGames(request, onList, onError);
        };
        return () => stop();
      },
    };
    await show(slow);
    expect(screen.getByText('Loading your online games…')).toBeOnTheScreen();
    expect(rowIds()).toEqual([]);
    await act(async () => answer?.());
    await flush();
    expect(screen.queryByTestId('online-games-loading')).toBeNull();
    expect(rowIds()).toHaveLength(1);
  });

  it('shows nothing when no game is active', async () => {
    signIn();
    await show();
    expect(screen.queryByTestId('home-online-games')).toBeNull();
  });

  it('lists "Your turn" first, at most three rows, then "See all"', async () => {
    signIn();
    const ids = [newGame(), newGame(), newGame(), newGame(), newGame()];
    const newest = [...ids].reverse();
    const expected = [...newest.filter(myTurn), ...newest.filter((id) => !myTurn(id))];
    // The seeded dice give both kinds, so the order matters.
    expect(newest.filter(myTurn).length).toBeGreaterThan(0);
    expect(newest.filter((id) => !myTurn(id)).length).toBeGreaterThan(0);
    const user = setupUser();
    const { onSeeAll } = await show();
    expect(screen.getByRole('header', { name: 'Your online games' })).toBeOnTheScreen();
    expect(rowIds()).toEqual(expected.slice(0, 3));
    await user.press(screen.getByRole('link', { name: 'See all (5)' }));
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });

  it('reads each row as one item, and a tap opens the game', async () => {
    signIn();
    const gameId = newGame();
    const user = setupUser();
    const { onOpen } = await show();
    const turn = myTurn(gameId) ? 'Your turn' : 'Waiting for your friend';
    const row = screen.getByRole('button', {
      name: `Portes vs friend, ${turn}, 0 to 0, 24 h left`,
    });
    expect(within(row).getByText('Portes vs friend')).toBeOnTheScreen();
    expect(within(row).getByText('0–0 · 24 h left')).toBeOnTheScreen();
    // One or two rows show no "See all".
    expect(screen.queryByTestId('online-games-see-all')).toBeNull();
    await user.press(row);
    expect(onOpen).toHaveBeenCalledWith(gameId);
  });

  it('follows the server: the friend moves, and the row turns to "Your turn"', async () => {
    signIn();
    let gameId = newGame();
    while (myTurn(gameId)) gameId = newGame();
    await show();
    const row = () => screen.getByTestId(`online-game-${gameId}`);
    expect(row()).toHaveAccessibleName(/^Portes vs friend, Waiting for your friend/);
    const before = view(gameId);
    await act(async () => {
      await onlineFake.transportFor(FRIEND).sendTurn({
        gameId,
        expectedVersion: before.version,
        moves: pickTurn(before.game, createSeededRng(3)),
      });
    });
    await flush();
    expect(view(gameId).waitingFor).toBe('white');
    expect(row()).toHaveAccessibleName(/^Portes vs friend, Your turn/);
    // Your turn now: the row moves to the top.
    expect(rowIds()[0]).toBe(gameId);
    // A new game shows up too, and a finished one goes.
    const second = newGame();
    await flush();
    expect(rowIds()).toContain(second);
    await act(async () => {
      await onlineFake.transportFor(FRIEND).resign(gameId);
    });
    await flush();
    expect(rowIds()).not.toContain(gameId);
    expect(rowIds()).toContain(second);
  });

  it('counts the time down while it shows', async () => {
    signIn();
    const gameId = newGame('live');
    await show();
    const row = screen.getByTestId(`online-game-${gameId}`);
    expect(within(row).getByText('0–0 · 60 s left')).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(within(row).getByText('0–0 · 55 s left')).toBeOnTheScreen();
  });

  it('says when the list did not load; Try again loads it', async () => {
    signIn();
    const gameId = newGame();
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
    await show(flaky);
    expect(
      screen.getByText('Your online games did not load. Check the connection.'),
    ).toBeOnTheScreen();
    expect(rowIds()).toEqual([]);
    offline = false;
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    await flush();
    expect(rowIds()).toEqual([gameId]);
    expect(screen.queryByTestId('online-games-failed')).toBeNull();
  });

  it('keeps the last list when the connection fails later', async () => {
    signIn();
    const gameId = newGame();
    let fail: ((error: unknown) => void) | undefined;
    const losing: GameTransport = {
      ...games!,
      watchMyGames(request, onList, onError) {
        fail = onError;
        return games!.watchMyGames(request, onList);
      },
    };
    const user = setupUser();
    await show(losing);
    expect(rowIds()).toEqual([gameId]);
    await act(async () => fail?.(new Error('connection lost')));
    expect(rowIds()).toEqual([gameId]);
    expect(
      screen.getByText('This list may be out of date. Check the connection.'),
    ).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Try again' }));
    await flush();
    expect(rowIds()).toEqual([gameId]);
    expect(screen.queryByTestId('online-games-stale')).toBeNull();
  });

  it('hides the list after a sign-out, and forgets the account', async () => {
    signIn();
    rememberOnlineAccount();
    newGame();
    await show();
    expect(screen.getByTestId('home-online-games')).toBeOnTheScreen();
    await act(async () => {
      await auth!.signOut();
    });
    await flush();
    expect(screen.queryByTestId('home-online-games')).toBeNull();
    expect(hasOnlineAccount()).toBe(false);
  });

  it('shows Greek', async () => {
    signIn();
    let gameId = newGame();
    while (!myTurn(gameId)) gameId = newGame();
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await show();
    expect(screen.getByRole('header', { name: 'Τα online παιχνίδια σου' })).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Πόρτες με φίλο, Σειρά σου, 0 προς 0, Χρόνος: 24 ώρες' }),
    ).toBeOnTheScreen();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });
});
