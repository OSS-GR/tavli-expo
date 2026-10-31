import type { createRecordingFeedback, createRecordingSoundPlayer } from '@tavli/contracts';
import { InlineBotRunner, createBot } from '@tavli/bot';
import { createSeededRng, rollDie, type PerPlayer } from '@tavli/engine';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import { feedback, sound } from '@/services';

import { createGameStore } from './gameStore';
import { GameScreen, OPENING_RESULT_MS, type BotSeat } from './GameScreen';
import type { Seat } from './seats';

import { touch } from '../../../test/gestureHandlerMock';
import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { renderWithRoot as render } from '../../../test/render';

// Records that the thrown dice rendered: the mock plays the throw at once
// (it ends inside the touch), so the rendered dice are the only trace of it.
const mockThrownDice: number[] = [];
jest.mock('../dice-throw/ThrownDie', () => ({
  ThrownDie: () => {
    mockThrownDice.push(1);
    return null;
  },
}));

const haptics = feedback as ReturnType<typeof createRecordingFeedback>;
const sounds = sound as ReturnType<typeof createRecordingSoundPlayer>;

/** A seed whose first two opening dice differ (no tie). */
function seedWithoutTie(): number {
  for (let seed = 1; ; seed++) {
    const rng = createSeededRng(seed);
    if (rollDie(rng) !== rollDie(rng)) return seed;
  }
}

function newStore(seed = seedWithoutTie()) {
  return createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    targetPoints: 3,
    rng: createSeededRng(seed),
  });
}

// The opening result closes by itself after 3 s (a timer).
runOnFakeTimers();

beforeEach(async () => {
  mockThrownDice.length = 0;
  haptics.calls.length = 0;
  sounds.played.length = 0;
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

describe('<GameScreen /> dice', () => {
  it('rolls the opening die of each player in turn (pass-and-play)', async () => {
    const user = setupUser();
    const store = newStore();
    await render(<GameScreen store={store} />);

    expect(screen.getByText('Who starts?')).toBeOnTheScreen();
    expect(screen.getAllByLabelText('Not rolled yet')).toHaveLength(2);

    await user.press(screen.getByRole('button', { name: 'Ann: roll, or swipe the board' }));
    const white = store.getState().flow.game.opening?.white;
    expect(screen.getByLabelText(`Rolled ${white}`)).toBeOnTheScreen();
    expect(screen.getAllByLabelText('Not rolled yet')).toHaveLength(1);

    await user.press(screen.getByRole('button', { name: 'Bob: roll, or swipe the board' }));
    const { game } = store.getState().flow;
    expect(game.phase).toBe('moving');
    const high = Math.max(game.opening!.white!, game.opening!.black!);
    const low = Math.min(game.opening!.white!, game.opening!.black!);
    const starter = game.starter === 'white' ? 'Ann' : 'Bob';
    expect(screen.getByText(`${starter} starts with ${high}-${low}.`)).toBeOnTheScreen();
    // The starter plays the two opening dice: they lie on the board once it
    // has its size (#184), under the result card until it closes.
    await act(async () => {
      fireEvent(screen.getByTestId('game-board', { includeHiddenElements: true }), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 500 } },
      });
    });
    const diceLabel = `Dice ${game.state.dice!.join('-')}, 2 left to play`;
    expect(screen.queryByLabelText(diceLabel)).toBeNull();
    expect(screen.getByLabelText(diceLabel, { includeHiddenElements: true })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'OK' }));
    expect(screen.getByLabelText(diceLabel)).toBeOnTheScreen();
    // A haptic for each die that landed, and the dice sounds.
    expect(haptics.calls).toEqual(['light', 'light']);
    expect(sounds.played).toContain('diceRoll');
    expect(sounds.played.filter((s) => s === 'diceLand')).toHaveLength(2);
    // The theme's sounds were preloaded.
    expect(sounds.loaded.length).toBeGreaterThan(0);
  });

  it('rolls both opening dice with one tap (vs bot)', async () => {
    const user = setupUser();
    const store = newStore();
    await render(<GameScreen store={store} openingTaps="one" />);
    await user.press(screen.getByRole('button', { name: 'Roll to start, or swipe the board' }));
    const { opening, phase } = store.getState().flow.game;
    expect(opening!.white !== null || opening!.ties.length > 0).toBe(true);
    expect(phase === 'moving' || opening!.ties.length > 0).toBe(true);
  });

  it('says so on a tie', async () => {
    const store = newStore();
    await render(<GameScreen store={store} />);
    await act(async () => {
      store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 4 });
      store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 4 });
    });
    expect(screen.getByText('Tie: both rolled 4. Roll again.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ann: roll, or swipe the board' })).toBeOnTheScreen();
  });

  it('closes the opening card after a moment', async () => {
    const store = newStore();
    await render(<GameScreen store={store} />);
    await act(async () => {
      store.getState().dispatch({ type: 'rollOpening', player: 'white', die: 5 });
      store.getState().dispatch({ type: 'rollOpening', player: 'black', die: 3 });
    });
    expect(screen.getByText('Ann starts with 5-3.')).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(OPENING_RESULT_MS + 10);
    });
    expect(screen.queryByTestId('opening-card')).toBeNull();
  });

  it('plays a checker click for a move and a cue for the next turn', async () => {
    const store = newStore();
    await render(<GameScreen store={store} />);
    await act(async () => {
      const { dispatch } = store.getState();
      dispatch({ type: 'rollOpening', player: 'white', die: 6 });
      dispatch({ type: 'rollOpening', player: 'black', die: 1 });
    });
    sounds.played.length = 0;
    haptics.calls.length = 0;
    await act(async () => {
      store
        .getState()
        .dispatch({ type: 'move', player: 'white', move: { from: 13, to: 7, die: 6 } });
    });
    expect(sounds.played).toEqual(['checkerPlace']);
    expect(haptics.calls).toEqual(['light']);
    await act(async () => {
      const { dispatch } = store.getState();
      dispatch({ type: 'move', player: 'white', move: { from: 13, to: 1, die: 1 } });
    });
    expect(sounds.played).toEqual(['checkerPlace', 'invalidMove']);
    expect(haptics.calls).toEqual(['light', 'warning']);
  });

  it('rolls the dice of a later turn with the Roll button, and no sound or haptic when off', async () => {
    const user = setupUser();
    const store = newStore();
    await act(async () => {
      settingsStore.getState().setSetting('haptics', false);
      settingsStore.getState().setSetting('sound', false);
    });
    await render(<GameScreen store={store} />);
    await act(async () => {
      const { dispatch } = store.getState();
      dispatch({ type: 'rollOpening', player: 'white', die: 6 });
      dispatch({ type: 'rollOpening', player: 'black', die: 1 });
      dispatch({ type: 'move', player: 'white', move: { from: 13, to: 7, die: 6 } });
      dispatch({ type: 'move', player: 'white', move: { from: 8, to: 7, die: 1 } });
      dispatch({ type: 'confirm', player: 'white' });
    });
    expect(store.getState().flow.game.phase).toBe('awaiting-roll');
    await act(async () => {
      fireEvent(screen.getByTestId('game-board', { includeHiddenElements: true }), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 500 } },
      });
    });
    await user.press(screen.getByRole('button', { name: 'Roll dice, or swipe the board' }));
    const { game } = store.getState().flow;
    expect(game.state.toMove).toBe('black');
    expect(game.state.dice).not.toBeNull();
    expect(haptics.calls).toEqual([]);
    expect(sounds.played).toEqual([]);
    // The button throws the dice over the board too (#183), with the same
    // cues as a swipe (the throw's knocks are sounds, so none here).
    expect(mockThrownDice.length).toBeGreaterThan(0);
  });

  it('rolls the opening die with a swipe over the card', async () => {
    const store = newStore();
    await render(<GameScreen store={store} />);
    await touch('opening-swipe', [
      { x: 20, y: 200 },
      { x: 120, y: 120 },
    ]);
    expect(store.getState().flow.game.opening?.white).not.toBeNull();
  });

  it('rolls the dice with a swipe on the board, and the throw plays', async () => {
    const store = newStore();
    await render(<GameScreen store={store} />);
    await act(async () => {
      const { dispatch } = store.getState();
      dispatch({ type: 'rollOpening', player: 'white', die: 6 });
      dispatch({ type: 'rollOpening', player: 'black', die: 1 });
      dispatch({ type: 'move', player: 'white', move: { from: 13, to: 7, die: 6 } });
      dispatch({ type: 'move', player: 'white', move: { from: 8, to: 7, die: 1 } });
      dispatch({ type: 'confirm', player: 'white' });
    });
    expect(store.getState().flow.game.state.dice).toBeNull();
    await act(async () => {
      fireEvent(screen.getByTestId('game-board', { includeHiddenElements: true }), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 500 } },
      });
    });
    await touch('game-board-pan', [
      { x: 20, y: 200 },
      { x: 120, y: 120 },
    ]);
    const { game } = store.getState().flow;
    expect(game.state.dice).not.toBeNull();
    // The throw played over the board (the mock plays it at once, so it has
    // already ended): the dice row shows the rolled dice, without a second
    // roll of its own (`rest`, see DiceRow).
    const row = screen.getByTestId('dice-row', { includeHiddenElements: true });
    expect(row.props.accessibilityLabel).toBe(`Dice ${game.state.dice!.join('-')}, 2 left to play`);
    // The throw played over the board: the thrown dice rendered.
    expect(mockThrownDice.length).toBeGreaterThan(0);
  });

  it('rolls with a swipe that starts outside the board (classic layout)', async () => {
    const store = newStore();
    await act(async () => {
      settingsStore.getState().setSetting('boardLayout', 'classic');
    });
    await render(<GameScreen store={store} />);
    await act(async () => {
      const { dispatch } = store.getState();
      dispatch({ type: 'rollOpening', player: 'white', die: 6 });
      dispatch({ type: 'rollOpening', player: 'black', die: 1 });
      dispatch({ type: 'move', player: 'white', move: { from: 13, to: 7, die: 6 } });
      dispatch({ type: 'move', player: 'white', move: { from: 8, to: 7, die: 1 } });
      dispatch({ type: 'confirm', player: 'white' });
    });
    await act(async () => {
      fireEvent(screen.getByTestId('game-board', { includeHiddenElements: true }), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 500 } },
      });
      // The board frame sits between the strips in the classic layout: the
      // swipe area shifts its touch into the board's points by its origin.
      fireEvent(screen.getByTestId('game-board-frame', { includeHiddenElements: true }), 'layout', {
        nativeEvent: { layout: { x: 0, y: 70, width: 375, height: 500 } },
      });
    });
    expect(store.getState().flow.game.state.dice).toBeNull();
    // The swipe starts on the strip above the board, not on the board: the
    // dice come in from the side of the board closest to the touch (above
    // it here), and land in the dice row.
    await touch('game-swipe-area', [
      { x: 187, y: 6 },
      { x: 187, y: 60 },
    ]);
    const { game } = store.getState().flow;
    expect(game.state.dice).not.toBeNull();
    // The throw played, and the dice row shows the rolled dice.
    expect(mockThrownDice.length).toBeGreaterThan(0);
    const row = screen.getByTestId('dice-row', { includeHiddenElements: true });
    expect(row.props.accessibilityLabel).toBe(`Dice ${game.state.dice!.join('-')}, 2 left to play`);
  });
});

describe('<GameScreen /> swiping while the bot waits', () => {
  const seats: PerPlayer<Seat> = {
    white: { name: 'You', label: 'You', turnLabel: 'Your turn', you: true },
    black: { name: 'Bot', label: 'Bot · Easy', turnLabel: 'Playing', you: false },
  };
  const bot: BotSeat = {
    player: 'black',
    difficulty: 'easy',
    runner: new InlineBotRunner(createBot()),
    rng: createSeededRng(1),
    timing: { beforeRollMs: 3000, moveMs: 0, thinkMs: () => 0 },
  };

  it('rolls nothing while the bot waits, and the bot still rolls itself', async () => {
    const store = newStore();
    await render(<GameScreen store={store} openingTaps="one" seats={seats} bot={bot} />);
    await act(async () => {
      const { dispatch } = store.getState();
      dispatch({ type: 'rollOpening', player: 'white', die: 6 });
      dispatch({ type: 'rollOpening', player: 'black', die: 1 });
      dispatch({ type: 'move', player: 'white', move: { from: 13, to: 7, die: 6 } });
      dispatch({ type: 'move', player: 'white', move: { from: 8, to: 7, die: 1 } });
      dispatch({ type: 'confirm', player: 'white' });
    });
    // The opening card closed with the first turn's moves: the bot's wait runs.
    expect(store.getState().flow.game.state.toMove).toBe('black');
    await act(async () => {
      fireEvent(screen.getByTestId('game-board', { includeHiddenElements: true }), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 500 } },
      });
    });
    // Excessive swiping during the bot's turn, on the board and around it:
    // none of it rolls for the bot.
    for (let i = 0; i < 3; i++) {
      await touch('game-swipe-area', [
        { x: 187, y: 6 },
        { x: 187, y: 60 },
      ]);
      await touch('game-board-pan', [
        { x: 20, y: 200 },
        { x: 120, y: 120 },
      ]);
    }
    expect(store.getState().flow.game.state.dice).toBeNull();
    expect(mockThrownDice.length).toBe(0);
    // The bot rolls itself when its wait is over, and its throw plays.
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    const rolls = store.getState().flow.log.filter((e) => e.type === 'roll');
    expect(rolls.at(-1)?.player).toBe('black');
    expect(store.getState().flow.game.state.dice).not.toBeNull();
    expect(mockThrownDice.length).toBeGreaterThan(0);
  });
});
