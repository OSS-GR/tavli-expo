import { InlineBotRunner, createBot } from '@tavli/bot';
import {
  createBoard,
  createGameFlow,
  createSeededRng,
  portes,
  type BoardState,
  type PerPlayer,
  type PlayerId,
} from '@tavli/engine';
import { getLayout, getTheme } from '@tavli/themes';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { AccessibilityInfo } from 'react-native';

import { fitBoardWithShadow, slotRect, stackPosition } from '@/features/board/geometry';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import i18n from '@/i18n';

import { createGameStore, type GameStore } from './gameStore';
import { BOT_PASS_NOTICE_MS, GameScreen, MATCH_END_DELAY_MS, type BotSeat } from './GameScreen';
import type { Seat } from './seats';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { touch } from '../../../test/gestureHandlerMock';
import { renderWithRoot } from '../../../test/render';
import { LANDSCAPE_SE, PORTRAIT_SE, resetWindow, setWindow } from '../../../test/window';

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
    fireEvent(screen.getByTestId('game-board', { includeHiddenElements: true }), 'layout', {
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

    await touch(PAN, [top(13, 5), point(7)]);
    await touch(PAN, [top(8, 3), point(7)]);
    // The moves change nothing in the strip: it has no pip count (#238).
    expect(screen.getByTestId('strip-bottom')).toHaveAccessibleName(
      'Ann, 0 of 3 points, Your turn',
    );
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
});

// The strips show no pip count (#238): the owner removed it.
describe('<GameScreen /> strips without a pip count (#238)', () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    await resetWindow();
  });

  it.each([
    ['portrait', 'en', PORTRAIT_SE, 'Ann, 0 of 3 points, Your turn', 'Bob, 0 of 3 points'],
    ['landscape', 'en', LANDSCAPE_SE, 'Ann, 0 of 3 points, Your turn', 'Bob, 0 of 3 points'],
    ['portrait', 'el', PORTRAIT_SE, 'Ann, 0 από 3 βαθμούς, Σειρά σου', 'Bob, 0 από 3 βαθμούς'],
    ['landscape', 'el', LANDSCAPE_SE, 'Ann, 0 από 3 βαθμούς, Σειρά σου', 'Bob, 0 από 3 βαθμούς'],
  ] as const)(
    '%s, %s: only the name, the score and the turn',
    async (layout, language, window, you, them) => {
      await setWindow(window);
      await act(async () => {
        await i18n.changeLanguage(language);
      });
      await annMoves61();
      const bottom = screen.getByTestId('strip-bottom');
      const upper = screen.getByTestId('strip-top');
      if (layout === 'landscape') {
        // The stacked strips of the left column.
        expect(within(screen.getByTestId('game-left')).getByTestId('strip-top')).toBe(upper);
      }
      expect(bottom).toHaveAccessibleName(you);
      expect(upper).toHaveAccessibleName(them);
      for (const strip of [bottom, upper]) {
        // No "Pips 167" or «Πόντοι 167».
        expect(strip).not.toHaveTextContent(/pip|πόντ|167/i);
        // No "·" is left after the name: Portes has no note.
        expect(strip).not.toHaveTextContent(/·/);
      }
    },
  );
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
    // The faded dice stay on the board, under the card (it says the roll).
    expect(
      screen.getByLabelText('Dice 6-6-6-6, 0 left to play', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
    // The board stays with Ann until the card closes.
    expect(within(screen.getByTestId('strip-bottom')).getByText('Ann')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Roll dice, or tap the board' })).toBeNull();

    await user.press(button('OK'));
    expect(screen.queryByText('No legal moves')).toBeNull();
    expect(within(screen.getByTestId('strip-bottom')).getByText('Bob')).toBeOnTheScreen();
    expect(button('Roll dice, or tap the board')).toBeOnTheScreen();
  });

  it('your own pass waits for OK: it does not close by itself (#178)', async () => {
    const user = setupUser();
    const store = newStore();
    setPosition(store, closed);
    await show(store);
    await act(async () => {
      store.getState().dispatch({ type: 'roll', player: 'white', dice: [5, 2] });
    });
    // A settings change draws the screen again meanwhile.
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    await act(async () => {
      settingsStore.setState({ showHints: false });
    });
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    const card = within(screen.getByTestId('pass-card'));
    expect(card.getByText('Ann rolled 5-2. No checker can move.')).toBeOnTheScreen();
    expect(card.queryByText(/Closes by itself/)).toBeNull();
    await user.press(button('OK'));
    expect(screen.queryByTestId('pass-card')).toBeNull();
  });
});

describe('<GameScreen /> no legal moves vs the bot (#178)', () => {
  const seats: PerPlayer<Seat> = {
    white: { name: 'You', label: 'You', turnLabel: 'Your turn', you: true },
    black: { name: 'Bot', label: 'Bot · Easy', turnLabel: 'Playing', you: false },
  };
  const bot: BotSeat = {
    player: 'black',
    difficulty: 'easy',
    runner: new InlineBotRunner(createBot()),
    rng: createSeededRng(1),
    timing: { beforeRollMs: 0, moveMs: 0, thinkMs: () => 0 },
  };
  // The bot (Black) is on the bar and you hold all six entry points.
  const botClosed = createBoard(
    {
      white: { points: { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 13: 3 } },
      black: { points: { 6: 14 }, bar: 1 },
    },
    'contrary',
  );
  const tick = async (ms: number) => {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  };
  /** The bot rolls (no wait before the roll) and passes; its card shows. */
  async function botPasses(paused = false) {
    const store = newStore();
    setPosition(store, botClosed, 'black');
    await show(store, { seats, bot });
    await tick(0);
    expect(store.getState().flow.game.state.toMove).toBe('white');
    expect(screen.getByTestId('pass-card')).toBeOnTheScreen();
    if (paused) await screen.rerender(<GameScreen store={store} seats={seats} bot={bot} paused />);
    return store;
  }

  it('your pass waits for OK; then the bot plays its turn', async () => {
    const user = setupUser();
    const store = newStore();
    setPosition(store, closedBoard);
    await show(store, { seats, bot });
    await act(async () => {
      store.getState().dispatch({ type: 'roll', player: 'white', dice: [6, 6] });
    });
    expect(screen.getByText('You rolled 6-6. No checker can move.')).toBeOnTheScreen();
    expect(screen.getByText('The turn passes to Bot.')).toBeOnTheScreen();
    // The bot waits while the card shows: it has not rolled.
    await tick(30_000);
    expect(screen.getByTestId('pass-card')).toBeOnTheScreen();
    expect(store.getState().flow.game.state.dice).toBeNull();
    expect(screen.queryByText(/Closes by itself/)).toBeNull();

    await user.press(button('OK'));
    expect(screen.queryByTestId('pass-card')).toBeNull();
    // A whole bot turn at Normal speed (#172) takes a few seconds of fake time.
    await waitFor(() => expect(store.getState().flow.game.state.toMove).toBe('white'), {
      timeout: 30_000,
    });
    const rolls = store.getState().flow.log.filter((e) => e.type === 'roll');
    expect(rolls.length).toBeGreaterThan(1);
  });

  it('the bot’s pass shows 3.5 s, then you can roll', async () => {
    await botPasses();
    const card = within(screen.getByTestId('pass-card'));
    expect(card.getByText(/^Bot rolled \d-\d\. No checker can move\.$/)).toBeOnTheScreen();
    expect(card.getByText('Your turn.')).toBeOnTheScreen();
    expect(card.getByText('Closes by itself after 3.5 s.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Roll dice, or tap the board' })).toBeNull();
    await tick(BOT_PASS_NOTICE_MS - 100);
    expect(screen.getByTestId('pass-card')).toBeOnTheScreen();
    await tick(110);
    expect(screen.queryByTestId('pass-card')).toBeNull();
    expect(button('Roll dice, or tap the board')).toBeOnTheScreen();
  });

  it('OK closes the bot’s pass sooner', async () => {
    const user = setupUser();
    await botPasses();
    await user.press(button('OK'));
    expect(screen.queryByTestId('pass-card')).toBeNull();
    expect(button('Roll dice, or tap the board')).toBeOnTheScreen();
  });

  it('the bot’s pass does not close while the screen is paused (menu open)', async () => {
    const store = await botPasses(true);
    await tick(BOT_PASS_NOTICE_MS * 3);
    expect(screen.getByTestId('pass-card')).toBeOnTheScreen();
    // Back from the menu: the card shows its full time again.
    await screen.rerender(<GameScreen store={store} seats={seats} bot={bot} />);
    await tick(BOT_PASS_NOTICE_MS - 100);
    expect(screen.getByTestId('pass-card')).toBeOnTheScreen();
    await tick(110);
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
