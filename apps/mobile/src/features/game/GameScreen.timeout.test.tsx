/**
 * The game-end sheet after a time-out (#170): an online turn timer ran out,
 * so the engine ends the game with the reason `timeout`. Online play is not
 * wired to the app yet, so the tests send the `timeout` action to the store
 * directly. The points follow the engine (scored like a resign: 2 when the
 * loser has borne off no checker, else 1). Fake timers, like every game
 * screen test (#152).
 */
import {
  createBoard,
  createGameFlow,
  createSeededRng,
  portes,
  type BoardState,
} from '@tavli/engine';
import { act, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import i18n from '@/i18n';

import { createGameStore, type GameStore } from './gameStore';
import { GameScreen } from './GameScreen';
import { plainSeats } from './seats';

import { runOnFakeTimers } from '../../../test/clock';
import { renderWithRoot } from '../../../test/render';

function newStore(): GameStore {
  return createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    targetPoints: 3,
    rng: createSeededRng(5),
  });
}

/** The game starts from `board` (the start position by default), White to roll. */
function startAt(store: GameStore, board?: BoardState) {
  const initial = portes.initialState({ startingPlayer: 'white' });
  const state = { ...initial, board: board ?? initial.board };
  store.setState({
    flow: { ...store.getState().flow, game: createGameFlow({ state, starter: 'white' }) },
  });
}

async function timeOut(store: GameStore) {
  await act(async () => {
    store.getState().dispatch({ type: 'timeout', player: 'white' });
  });
}

let announce: jest.SpyInstance;

runOnFakeTimers();

beforeEach(async () => {
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

afterEach(() => {
  announce.mockRestore();
});

describe('<GameScreen /> game end on time (#170)', () => {
  it('names the player who ran out of time; a diplo when they bore off nothing', async () => {
    const store = newStore();
    startAt(store);
    await renderWithRoot(<GameScreen store={store} />);
    await timeOut(store);

    expect(store.getState().flow.game.result).toEqual({
      winner: 'black',
      points: 2,
      reason: 'timeout',
    });
    expect(screen.getByTestId('game-end-card')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Bob wins the game!' })).toBeOnTheScreen();
    expect(screen.getByText('Diplo · +2 points')).toBeOnTheScreen();
    expect(screen.getByText('Ann ran out of time.')).toBeOnTheScreen();
    // The sheet reads the reason once; nothing else says it again.
    const timeouts = announce.mock.calls.filter(([text]) => String(text).includes('out of time'));
    expect(timeouts).toEqual([
      ['Bob wins the game! Diplo · +2 points Ann ran out of time. Ann 0 – 2 Bob'],
    ]);
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(
      announce.mock.calls.filter(([text]) => String(text).includes('out of time')),
    ).toHaveLength(1);
  });

  it('a mono when the player who ran out of time bore off a checker', async () => {
    const store = newStore();
    startAt(
      store,
      createBoard(
        {
          white: { points: { 1: 5, 2: 5, 3: 4 }, off: 1 },
          black: { points: { 6: 5, 13: 5, 8: 3, 7: 2 } },
        },
        'contrary',
      ),
    );
    await renderWithRoot(<GameScreen store={store} />);
    await timeOut(store);

    expect(store.getState().flow.game.result).toEqual({
      winner: 'black',
      points: 1,
      reason: 'timeout',
    });
    expect(screen.getByText('Mono · +1 point')).toBeOnTheScreen();
    expect(screen.getByText('Ann ran out of time.')).toBeOnTheScreen();
    // A time-out is not a bear-off: no "did not bear off" line.
    expect(screen.queryByText(/bear off/)).toBeNull();
  });

  it('says "You ran out of time." to the person holding the phone', async () => {
    const store = newStore();
    startAt(store);
    const seats = plainSeats({ white: 'You', black: 'Bot' }, 'Playing');
    await renderWithRoot(
      <GameScreen store={store} seats={{ ...seats, white: { ...seats.white, you: true } }} />,
    );
    await timeOut(store);

    expect(screen.getByRole('header', { name: 'Bot wins the game!' })).toBeOnTheScreen();
    expect(screen.getByText('You ran out of time.')).toBeOnTheScreen();
  });

  it('says it in Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    try {
      const store = newStore();
      startAt(store);
      await renderWithRoot(<GameScreen store={store} />);
      await timeOut(store);
      expect(screen.getByText('Ann: τελείωσε ο χρόνος.')).toBeOnTheScreen();
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });
});
