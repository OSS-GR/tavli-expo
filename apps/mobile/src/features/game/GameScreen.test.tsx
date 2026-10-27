import type { createRecordingFeedback } from '@tavli/contracts';
import { createSeededRng, rollDie } from '@tavli/engine';
import { act, screen, userEvent } from '@testing-library/react-native';

import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import { feedback } from '@/services';

import { createGameStore } from './gameStore';
import { GameScreen, OPENING_RESULT_MS } from './GameScreen';

import { renderWithRoot as render } from '../../../test/render';

const haptics = feedback as ReturnType<typeof createRecordingFeedback>;

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

beforeEach(async () => {
  haptics.calls.length = 0;
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

describe('<GameScreen /> dice', () => {
  it('rolls the opening die of each player in turn (pass-and-play)', async () => {
    const user = userEvent.setup();
    const store = newStore();
    await render(<GameScreen store={store} />);

    expect(screen.getByText('Who starts?')).toBeOnTheScreen();
    expect(screen.getAllByLabelText('Not rolled yet')).toHaveLength(2);

    await user.press(screen.getByRole('button', { name: 'Ann: roll, or tap the board' }));
    const white = store.getState().flow.game.opening?.white;
    expect(screen.getByLabelText(`Rolled ${white}`)).toBeOnTheScreen();
    expect(screen.getAllByLabelText('Not rolled yet')).toHaveLength(1);

    await user.press(screen.getByRole('button', { name: 'Bob: roll, or tap the board' }));
    const { game } = store.getState().flow;
    expect(game.phase).toBe('moving');
    const high = Math.max(game.opening!.white!, game.opening!.black!);
    const low = Math.min(game.opening!.white!, game.opening!.black!);
    const starter = game.starter === 'white' ? 'Ann' : 'Bob';
    expect(screen.getByText(`${starter} starts with ${high}-${low}.`)).toBeOnTheScreen();
    // The starter plays the two opening dice: they show in the controls row.
    expect(
      screen.getByLabelText(`Dice ${game.state.dice!.join('-')}, 2 left to play`),
    ).toBeOnTheScreen();
    // A haptic for each die that landed.
    expect(haptics.calls).toEqual(['light', 'light']);
  });

  it('rolls both opening dice with one tap (vs bot)', async () => {
    const user = userEvent.setup();
    const store = newStore();
    await render(<GameScreen store={store} openingTaps="one" />);
    await user.press(screen.getByRole('button', { name: 'Roll to start, or tap the board' }));
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
    expect(screen.getByText('Tie! Both rolled 4. Roll again.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ann: roll, or tap the board' })).toBeOnTheScreen();
  });

  it('closes the opening card after a moment', async () => {
    jest.useFakeTimers();
    try {
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
    } finally {
      jest.useRealTimers();
    }
  });

  it('rolls the dice of a later turn with the Roll button, and no haptic when it is off', async () => {
    const user = userEvent.setup();
    const store = newStore();
    await act(async () => {
      settingsStore.getState().setSetting('haptics', false);
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
    await user.press(screen.getByRole('button', { name: 'Roll dice, or tap the board' }));
    const { game } = store.getState().flow;
    expect(game.state.toMove).toBe('black');
    expect(game.state.dice).not.toBeNull();
    expect(haptics.calls).toEqual([]);
  });
});
