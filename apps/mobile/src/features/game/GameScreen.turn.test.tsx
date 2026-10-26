import {
  createBoard,
  createGameFlow,
  createSeededRng,
  portes,
  type BoardState,
  type PlayerId,
} from '@tavli/engine';
import { getLayout, getTheme } from '@tavli/themes';
import { act, fireEvent, screen, userEvent, within } from '@testing-library/react-native';

import { fitBoardWithShadow, slotRect, stackPosition } from '@/features/board/geometry';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';

import { createGameStore, type GameStore } from './gameStore';
import { GameScreen, PASS_NOTICE_MS } from './GameScreen';

import { touch } from '../../../test/gestureHandlerMock';
import { renderWithRoot } from '../../../test/render';

const SIZE = { width: 375, height: 500 };
const geo = fitBoardWithShadow(getLayout(getTheme('walnut-kafeneio'), 'portrait-rotated'), SIZE);
const PAN = 'game-board-pan';

const center = (slot: Parameters<typeof slotRect>[1]) => {
  const r = slotRect(geo, slot);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
const point = (index: number) => center({ kind: 'point', index });
const top = (index: number, count: number) =>
  stackPosition(geo, { kind: 'point', index }, count, count - 1);

function newStore(targetPoints = 3): GameStore {
  return createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    targetPoints,
    rng: createSeededRng(5),
  });
}

/** Puts the current game on `board`, with `player` to roll. */
function setPosition(store: GameStore, board: BoardState, player: PlayerId = 'white') {
  const { flow } = store.getState();
  const state = { ...portes.initialState({ startingPlayer: player }), board };
  store.setState({ flow: { ...flow, game: createGameFlow({ state, starter: player }) } });
}

async function show(store: GameStore) {
  await renderWithRoot(<GameScreen store={store} />);
  await act(async () => {
    fireEvent(screen.getByTestId('game-board'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...SIZE } },
    });
  });
}

/** Ann (White) starts with 6-1; the opening card is closed. */
async function annMoves61(store = newStore()) {
  store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 6 });
  store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 1 });
  await show(store);
  await act(async () => {
    fireEvent.press(screen.getByTestId('opening-overlay'));
  });
  return store;
}

const button = (name: RegExp | string) => screen.getByRole('button', { name });
const phase = (store: GameStore) => store.getState().flow.game.phase;

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

describe('<GameScreen /> undo and confirm', () => {
  it('takes back one move at a time', async () => {
    const user = userEvent.setup();
    const store = await annMoves61();
    expect(button('↶ Undo')).toBeDisabled();
    await touch(PAN, [top(13, 5), point(7)]);
    await touch(PAN, [top(8, 3), point(7)]);
    expect(store.getState().flow.game.played).toHaveLength(2);
    await user.press(button('↶ Undo'));
    expect(store.getState().flow.game.played.map((m) => `${m.from}/${m.to}`)).toEqual(['13/7']);
    expect(phase(store)).toBe('moving');
  });

  it('enables Confirm only when the turn is complete, then passes the turn', async () => {
    const user = userEvent.setup();
    const store = await annMoves61();
    expect(button('Confirm')).toBeDisabled();
    await touch(PAN, [top(13, 5), point(7)]);
    expect(button('Confirm')).toBeDisabled();
    expect(screen.queryByTestId('confirm-hint')).toBeNull();
    await touch(PAN, [top(8, 3), point(7)]);
    expect(button('Confirm')).toBeEnabled();
    expect(screen.getByText('All dice used. Confirm or undo.')).toBeOnTheScreen();

    await user.press(button('Confirm'));
    expect(phase(store)).toBe('awaiting-roll');
    expect(store.getState().flow.game.state.toMove).toBe('black');
    expect(button('Roll dice, or tap the board')).toBeOnTheScreen();
  });

  it('ends the turn by itself with auto-confirm on', async () => {
    await act(async () => {
      settingsStore.getState().setSetting('autoConfirmMoves', true);
    });
    const store = await annMoves61();
    await touch(PAN, [top(13, 5), point(7)]);
    await touch(PAN, [top(8, 3), point(7)]);
    expect(phase(store)).toBe('awaiting-roll');
    expect(store.getState().flow.game.state.toMove).toBe('black');
  });
});

describe('<GameScreen /> turn indicator', () => {
  it('marks the player to move, and flips the board to them (flip)', async () => {
    const user = userEvent.setup();
    const store = await annMoves61();
    const bottom = () => within(screen.getByTestId('strip-bottom'));
    const upper = () => within(screen.getByTestId('strip-top'));
    expect(bottom().getByText('Ann')).toBeOnTheScreen();
    expect(bottom().getByText('YOUR TURN')).toBeOnTheScreen();
    expect(upper().queryByText('YOUR TURN')).toBeNull();
    expect(bottom().getByText('Pips 167')).toBeOnTheScreen();
    expect(upper().getByText('Pips 167')).toBeOnTheScreen();

    await touch(PAN, [top(13, 5), point(7)]);
    await touch(PAN, [top(8, 3), point(7)]);
    // The pip count follows the moves of the turn: 167 - 6 - 1.
    expect(bottom().getByText('Pips 160')).toBeOnTheScreen();
    await user.press(button('Confirm'));
    expect(bottom().getByText('Bob')).toBeOnTheScreen();
    expect(bottom().getByText('YOUR TURN')).toBeOnTheScreen();
    expect(upper().getByText('Ann')).toBeOnTheScreen();
    expect(store.getState().flow.game.state.toMove).toBe('black');
  });

  it('keeps White at the bottom in fixed view', async () => {
    const user = userEvent.setup();
    await act(async () => {
      settingsStore.getState().setSetting('boardFlipMode', 'fixed');
    });
    await annMoves61();
    await touch(PAN, [top(13, 5), point(7)]);
    await touch(PAN, [top(8, 3), point(7)]);
    await user.press(button('Confirm'));
    const bottom = within(screen.getByTestId('strip-bottom'));
    expect(bottom.getByText('Ann')).toBeOnTheScreen();
    expect(bottom.queryByText('YOUR TURN')).toBeNull();
    expect(within(screen.getByTestId('strip-top')).getByText('YOUR TURN')).toBeOnTheScreen();
  });

  it('hides pip counts when the setting is off', async () => {
    await act(async () => {
      settingsStore.getState().setSetting('showPipCounts', false);
    });
    await annMoves61();
    expect(screen.queryByText(/^Pips/)).toBeNull();
  });
});

describe('<GameScreen /> no legal moves', () => {
  // Ann is on the bar and Bob holds all six entry points.
  const closed = createBoard(
    {
      white: { points: { 6: 14 }, bar: 1 },
      black: { points: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 13: 3 } },
    },
    'contrary',
  );

  it('explains the pass, keeps the faded dice and closes on OK', async () => {
    const user = userEvent.setup();
    const store = newStore();
    setPosition(store, closed);
    await show(store);
    await act(async () => {
      store.getState().dispatch({ type: 'roll', player: 'white', dice: [6, 6] });
    });
    expect(store.getState().flow.game.state.toMove).toBe('black');
    expect(screen.getByText('No legal moves')).toBeOnTheScreen();
    expect(screen.getByText('Ann rolled 6-6. No checker can move.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Dice 6-6-6-6, 0 left to play')).toBeOnTheScreen();
    // The board stays with Ann until the card closes.
    expect(within(screen.getByTestId('strip-bottom')).getByText('Ann')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Roll dice, or tap the board' })).toBeNull();

    await user.press(button('OK'));
    expect(screen.queryByText('No legal moves')).toBeNull();
    expect(within(screen.getByTestId('strip-bottom')).getByText('Bob')).toBeOnTheScreen();
    expect(button('Roll dice, or tap the board')).toBeOnTheScreen();
  });

  it('closes by itself after 3 s', async () => {
    jest.useFakeTimers();
    try {
      const store = newStore();
      setPosition(store, closed);
      await show(store);
      await act(async () => {
        store.getState().dispatch({ type: 'roll', player: 'white', dice: [5, 2] });
      });
      expect(screen.getByTestId('pass-card')).toBeOnTheScreen();
      await act(async () => {
        jest.advanceTimersByTime(PASS_NOTICE_MS + 10);
      });
      expect(screen.queryByTestId('pass-card')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('<GameScreen /> game and match end', () => {
  // Ann bears off her last checker; Bob has borne off none: diplo.
  const lastChecker = createBoard(
    { white: { points: { 1: 1 }, off: 14 }, black: { points: { 6: 15 } } },
    'contrary',
  );

  async function winGame(store: GameStore) {
    const user = userEvent.setup();
    setPosition(store, lastChecker);
    await show(store);
    await act(async () => {
      store.getState().dispatch({ type: 'roll', player: 'white', dice: [3, 2] });
    });
    // Tap the checker, then the tray.
    await touch(PAN, [top(1, 1)]);
    await touch(PAN, [center({ kind: 'tray', side: 'player' })]);
    await user.press(button('Confirm'));
    return user;
  }

  it('shows the winner, diplo and the score, then starts the next game', async () => {
    const store = newStore(3);
    const user = await winGame(store);
    expect(screen.getByText('Ann wins the game!')).toBeOnTheScreen();
    expect(screen.getByText('Diplo · +2 points')).toBeOnTheScreen();
    expect(screen.getByText('Ann 2 – 0 Bob')).toBeOnTheScreen();
    await user.press(button('Next game, Ann starts'));
    const { game } = store.getState().flow;
    expect(game.phase).toBe('awaiting-roll');
    expect(game.state.toMove).toBe('white');
    expect(store.getState().flow.match.games).toHaveLength(1);
  });

  it('ends the match at the target and offers a rematch', async () => {
    const store = newStore(2);
    const user = await winGame(store);
    expect(screen.getByText('Ann wins the match!')).toBeOnTheScreen();
    await user.press(button('Rematch, Ann starts'));
    const { flow } = store.getState();
    expect(flow.match.score).toEqual({ white: 0, black: 0 });
    expect(flow.game.phase).toBe('awaiting-roll');
    expect(flow.game.state.toMove).toBe('white');
  });
});
