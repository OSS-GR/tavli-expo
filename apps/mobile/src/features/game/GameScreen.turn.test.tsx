import {
  createBoard,
  createGameFlow,
  createSeededRng,
  portes,
  type BoardState,
  type PlayerId,
} from '@tavli/engine';
import { getLayout, getTheme } from '@tavli/themes';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { AccessibilityInfo } from 'react-native';

import { fitBoardWithShadow, slotRect, stackPosition } from '@/features/board/geometry';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';

import { createGameStore, type GameStore } from './gameStore';
import { GameScreen, MATCH_END_DELAY_MS, PASS_NOTICE_MS } from './GameScreen';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
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

async function show(store: GameStore, props: Partial<ComponentProps<typeof GameScreen>> = {}) {
  await renderWithRoot(<GameScreen store={store} {...props} />);
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
  // The opening card takes taps on the whole board area, not only on the card.
  expect(screen.getByTestId('opening-overlay')).toHaveStyle({ flex: 1 });
  await act(async () => {
    fireEvent.press(screen.getByTestId('opening-overlay'));
  });
  return store;
}

const button = (name: RegExp | string) => screen.getByRole('button', { name });
const phase = (store: GameStore) => store.getState().flow.game.phase;

// The opening result, the pass card and the match end run on timers.
runOnFakeTimers();

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

describe('<GameScreen /> undo and confirm', () => {
  it('takes back one move at a time', async () => {
    const user = setupUser();
    const store = await annMoves61();
    expect(button('Undo')).toBeDisabled();
    await touch(PAN, [top(13, 5), point(7)]);
    await touch(PAN, [top(8, 3), point(7)]);
    expect(store.getState().flow.game.played).toHaveLength(2);
    await user.press(button('Undo'));
    expect(store.getState().flow.game.played.map((m) => `${m.from}/${m.to}`)).toEqual(['13/7']);
    expect(phase(store)).toBe('moving');
  });

  it('enables Confirm only when the turn is complete, then passes the turn', async () => {
    const user = setupUser();
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
    const user = setupUser();
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
    const user = setupUser();
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

// Ann is on the bar and Bob holds all six entry points.
const closedBoard = createBoard(
  {
    white: { points: { 6: 14 }, bar: 1 },
    black: { points: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 13: 3 } },
  },
  'contrary',
);

describe('<GameScreen /> no legal moves', () => {
  const closed = closedBoard;

  it('explains the pass, keeps the faded dice and closes on OK', async () => {
    const user = setupUser();
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
  });

  it('closes after 3 s even when the screen draws again meanwhile', async () => {
    const store = newStore();
    setPosition(store, closed);
    await show(store);
    await act(async () => {
      store.getState().dispatch({ type: 'roll', player: 'white', dice: [5, 2] });
    });
    await act(async () => {
      jest.advanceTimersByTime(PASS_NOTICE_MS - 1000);
    });
    // A settings change draws the screen again; the timer keeps running.
    await act(async () => {
      settingsStore.setState({ showPipCounts: false });
    });
    await act(async () => {
      jest.advanceTimersByTime(1010);
    });
    expect(screen.queryByTestId('pass-card')).toBeNull();
  });
});

describe('<GameScreen /> game and match end', () => {
  // Ann bears off her last checker; Bob has borne off none: diplo.
  const lastChecker = createBoard(
    { white: { points: { 1: 1 }, off: 14 }, black: { points: { 6: 15 } } },
    'contrary',
  );
  // The same, but Bob has borne off one checker: mono.
  const lastCheckerMono = createBoard(
    { white: { points: { 1: 1 }, off: 14 }, black: { points: { 6: 14 }, off: 1 } },
    'contrary',
  );

  async function winGame(
    store: GameStore,
    board = lastChecker,
    props: Partial<ComponentProps<typeof GameScreen>> = {},
  ) {
    const user = setupUser();
    setPosition(store, board);
    await show(store, props);
    await act(async () => {
      store.getState().dispatch({ type: 'roll', player: 'white', dice: [3, 2] });
    });
    // Tap the checker, then the tray.
    await touch(PAN, [top(1, 1)]);
    await touch(PAN, [center({ kind: 'tray', side: 'player' })]);
    await user.press(button('Confirm'));
    return user;
  }

  it('shows the winner, diplo, why, and the score, then starts the next game', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const store = newStore(3);
    const onHome = jest.fn();
    const user = await winGame(store, lastChecker, { onHome });
    const sheet = within(screen.getByTestId('game-end-card'));
    expect(sheet.getByRole('header', { name: 'Ann wins the game!' })).toBeOnTheScreen();
    expect(sheet.getByText('Diplo · +2 points')).toBeOnTheScreen();
    expect(sheet.getByText('Bob did not bear off any checker.')).toBeOnTheScreen();
    expect(sheet.getByText('Match')).toBeOnTheScreen();
    expect(sheet.getByText('Ann 2 – 0 Bob')).toBeOnTheScreen();
    expect(sheet.getByText('First to 3 points')).toBeOnTheScreen();
    // Pass-and-play: the winner is a human, so the celebration plays.
    // Screen readers skip it (hidden from accessibility).
    expect(screen.queryByTestId('game-celebration')).toBeNull();
    expect(
      screen.getByTestId('game-celebration', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    // Screen readers hear the result.
    expect(announce).toHaveBeenCalledWith(
      'Ann wins the game! Diplo · +2 points Bob did not bear off any checker. Ann 2 – 0 Bob',
    );
    // No moves on the final board while the sheet shows.
    expect(screen.queryByTestId('roll-button')).toBeNull();

    await user.press(button('Home'));
    expect(onHome).toHaveBeenCalled();
    await user.press(button('Next game, Ann starts'));
    const { game } = store.getState().flow;
    expect(game.phase).toBe('awaiting-roll');
    expect(game.state.toMove).toBe('white');
    expect(store.getState().flow.match.games).toHaveLength(1);
    expect(screen.queryByTestId('game-end-card')).toBeNull();
    announce.mockRestore();
  });

  it('shows mono with no reason line when the loser has borne off', async () => {
    const store = newStore(3);
    await winGame(store, lastCheckerMono);
    const sheet = within(screen.getByTestId('game-end-card'));
    expect(sheet.getByText('Mono · +1 point')).toBeOnTheScreen();
    expect(sheet.queryByText(/did not bear off/)).toBeNull();
    expect(sheet.getByText('Ann 1 – 0 Bob')).toBeOnTheScreen();
    // No Home button without `onHome`.
    expect(screen.queryByRole('button', { name: 'Home' })).toBeNull();
  });

  it('skips the game-end sheet at the target and asks for the match-end screen', async () => {
    const store = newStore(2);
    const onMatchOver = jest.fn();
    await winGame(store, lastChecker, { onMatchOver });
    expect(store.getState().flow.match.status).toBe('finished');
    expect(screen.queryByTestId('game-end-card')).toBeNull();
    // The final position stays a moment, so the last checker lands first.
    expect(onMatchOver).not.toHaveBeenCalled();
    expect(screen.queryByTestId('roll-button')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(MATCH_END_DELAY_MS);
    });
    expect(onMatchOver).toHaveBeenCalledTimes(1);
  });
});
