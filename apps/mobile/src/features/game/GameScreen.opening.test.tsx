/**
 * The opening roll card (#176): real dice before the roll, a clear Roll
 * button with the player's name, a tie that stays until the next roll,
 * and a result that stays until a tap or `OPENING_RESULT_MS`. Every step
 * is read to screen readers. On fake timers: the card waits on timers.
 */
import { createSeededRng, rollDie as rollRng, type DieValue, type PlayerId } from '@tavli/engine';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import i18n from '@/i18n';

import { createGameStore, type GameStore } from './gameStore';
import { GameScreen, OPENING_RESULT_MS, OPENING_TIE_WAIT_MS } from './GameScreen';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { nativeParent, nativePath } from '../../../test/nativeParent';
import { renderWithRoot as render } from '../../../test/render';

const hidden = { includeHiddenElements: true };

function newStore(names = { white: 'Ann', black: 'Bob' }, seed = 5): GameStore {
  return createGameStore({ players: names, targetPoints: 3, rng: createSeededRng(seed) });
}

/** A seed whose first two opening dice are a tie. */
function seedWithTie(): number {
  for (let seed = 1; ; seed++) {
    const rng = createSeededRng(seed);
    if (rollRng(rng) === rollRng(rng)) return seed;
  }
}

/** Rolls a set opening die, as the Roll button would. */
async function rollDie(store: GameStore, player: PlayerId, die: DieValue) {
  await act(async () => {
    store.getState().dispatch({ type: 'rollOpening', player, die });
  });
}

async function wait(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

const card = () => within(screen.getByTestId('opening-card'));
const message = () => screen.getByTestId('opening-message');

let announce: jest.SpyInstance;

runOnFakeTimers();

beforeEach(async () => {
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

afterEach(async () => {
  announce.mockRestore();
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

const announced = () => announce.mock.calls.map(([text]) => text as string);

describe('<GameScreen /> opening roll (#176)', () => {
  it('shows a blank die for each player and a Roll button with the name on the card', async () => {
    await render(<GameScreen store={newStore()} />);
    // Two dice drawn on canvases, no "?" boxes.
    expect(screen.queryByText('?')).toBeNull();
    const dice = card().getAllByLabelText('Not rolled yet');
    expect(dice).toHaveLength(2);
    for (const die of dice) expect(die.type).toBe('Canvas');
    // The names sit under the dice.
    expect(card().getByText('Ann')).toBeOnTheScreen();
    expect(card().getByText('Bob')).toBeOnTheScreen();
    // The Roll button is on the card, next to the dice.
    expect(card().getByRole('button', { name: 'Ann: roll, or swipe the board' })).toBeOnTheScreen();
    expect(screen.getAllByTestId('roll-button')).toHaveLength(1);
    expect(announced()).toEqual([
      'Each player rolls one die. The higher die starts and plays both. Ann: roll.',
    ]);
  });

  it('pass-and-play: says who rolled what, then whose roll it is', async () => {
    const user = setupUser();
    const store = newStore();
    await render(<GameScreen store={store} />);
    const dice = () => [
      screen.getByTestId('opening-die-white'),
      screen.getByTestId('opening-die-black'),
    ];
    const canvasBefore = dice();
    const pathsBefore = canvasBefore.map(nativePath);
    await user.press(screen.getByRole('button', { name: 'Ann: roll, or swipe the board' }));
    const white = store.getState().flow.game.opening!.white!;
    expect(message()).toHaveTextContent(`Ann rolled ${white}.`);
    expect(card().getByLabelText(`Rolled ${white}`)).toBeOnTheScreen();
    expect(card().getAllByLabelText('Not rolled yet')).toHaveLength(1);
    expect(announced()).toContain(`Ann rolled ${white}. Bob: roll.`);
    // The dice canvases stay the same views, in the same native views (#173):
    // each sits in its own view that never flattens.
    const expectSameCanvases = () =>
      dice().forEach((canvas, i) => {
        expect(canvas === canvasBefore[i]).toBe(true);
        expect(nativeParent(canvas)?.props.collapsable).toBe(false);
        expect(nativePath(canvas)).toBe(pathsBefore[i]);
      });
    expectSameCanvases();
    // A tap on the board rolls for Bob.
    await user.press(screen.getByTestId('opening-overlay'));
    expect(store.getState().flow.game.opening!.black).not.toBeNull();
    expectSameCanvases();
  });

  it('a tie keeps both dice and says so until the next roll; Roll waits for the dice to land', async () => {
    const store = newStore();
    await render(<GameScreen store={store} />);
    await rollDie(store, 'white', 4);
    await rollDie(store, 'black', 4);

    expect(message()).toHaveTextContent('Tie: both rolled 4. Roll again.');
    expect(card().getAllByLabelText('Rolled 4')).toHaveLength(2);
    expect(card().queryByLabelText('Not rolled yet')).toBeNull();
    expect(announced()).toContain('Tie: both rolled 4. Roll again. Ann: roll.');

    // Right after the tie a tap does nothing: the button waits while the dice land.
    const button = card().getByRole('button', { name: 'Ann: roll, or swipe the board' });
    expect(button).toBeDisabled();
    await act(async () => {
      fireEvent.press(screen.getByTestId('opening-overlay'));
    });
    expect(store.getState().flow.game.opening!.white).toBeNull();

    // The tie does not go away by itself.
    await wait(OPENING_TIE_WAIT_MS);
    expect(button).toBeEnabled();
    await wait(OPENING_RESULT_MS * 5);
    expect(message()).toHaveTextContent('Tie: both rolled 4. Roll again.');
    expect(card().getAllByLabelText('Rolled 4')).toHaveLength(2);

    // The next roll starts a new round: Bob's die is blank again.
    const user = setupUser();
    await user.press(card().getByRole('button', { name: 'Ann: roll, or swipe the board' }));
    const white = store.getState().flow.game.opening!.white!;
    expect(white).not.toBeNull();
    expect(message()).toHaveTextContent(`Ann rolled ${white}.`);
    expect(card().getAllByLabelText('Not rolled yet')).toHaveLength(1);
  });

  it('reads the same tie again in a new round', async () => {
    const store = newStore();
    await render(<GameScreen store={store} />);
    await rollDie(store, 'white', 4);
    await rollDie(store, 'black', 4);
    await wait(OPENING_TIE_WAIT_MS);
    await rollDie(store, 'white', 4);
    await rollDie(store, 'black', 4);
    const tie = 'Tie: both rolled 4. Roll again. Ann: roll.';
    expect(announced().filter((text) => text === tie)).toHaveLength(2);
    // The second tie waits again.
    expect(card().getByRole('button', { name: 'Ann: roll, or swipe the board' })).toBeDisabled();
  });

  it('vs bot: one tap rolls both dice, and a tie shows both', async () => {
    const user = setupUser();
    const store = newStore({ white: 'You', black: 'Asodio' }, seedWithTie());
    await render(<GameScreen store={store} openingTaps="one" />);
    expect(
      card().getByRole('button', { name: 'Roll to start, or swipe the board' }),
    ).toBeOnTheScreen();
    await user.press(screen.getByTestId('opening-overlay'));
    // The bot's die rolled with the same tap: both dice show the tie.
    const { opening, phase } = store.getState().flow.game;
    expect(phase).toBe('opening-roll');
    const tie = opening!.ties[0]!;
    expect(message()).toHaveTextContent(`Tie: both rolled ${tie}. Roll again.`);
    expect(card().getAllByLabelText(`Rolled ${tie}`)).toHaveLength(2);
    // After the wait, one tap rolls both again.
    await wait(OPENING_TIE_WAIT_MS);
    await user.press(card().getByRole('button', { name: 'Roll to start, or swipe the board' }));
    const next = store.getState().flow.game;
    expect(next.opening!.ties.length > 1 || next.phase !== 'opening-roll').toBe(true);
  });

  it('the result stays until OPENING_RESULT_MS, with the dice and the names', async () => {
    const store = newStore({ white: 'Maria', black: 'Nikos' });
    await render(<GameScreen store={store} />);
    await rollDie(store, 'white', 6);
    await rollDie(store, 'black', 3);
    expect(message()).toHaveTextContent('Maria starts with 6-3.');
    expect(card().getByLabelText('Rolled 6')).toBeOnTheScreen();
    expect(card().getByLabelText('Rolled 3')).toBeOnTheScreen();
    expect(card().getByText('Closes by itself after 3 s.')).toBeOnTheScreen();
    expect(announced()).toContain('Maria starts with 6-3.');
    expect(OPENING_RESULT_MS).toBeGreaterThanOrEqual(3000);

    await wait(OPENING_RESULT_MS - 10);
    expect(screen.getByTestId('opening-card')).toBeOnTheScreen();
    await wait(20);
    expect(screen.queryByTestId('opening-card')).toBeNull();
    expect(screen.getByTestId('game-board')).toBeOnTheScreen();
  });

  it('OK or a tap on the board closes the result early', async () => {
    const user = setupUser();
    const store = newStore();
    await render(<GameScreen store={store} />);
    await rollDie(store, 'white', 2);
    await rollDie(store, 'black', 5);
    expect(message()).toHaveTextContent('Bob starts with 5-2.');
    await user.press(card().getByRole('button', { name: 'OK' }));
    expect(screen.queryByTestId('opening-card')).toBeNull();
    expect(screen.getByTestId('game-board', hidden)).toBeOnTheScreen();
  });

  it('vs bot: "You start"', async () => {
    const store = newStore({ white: 'You', black: 'Asodio' });
    await render(
      <GameScreen
        store={store}
        openingTaps="one"
        seats={{
          white: { name: 'You', label: 'You', turnLabel: 'Your turn', you: true },
          black: { name: 'Asodio', label: 'Asodio', turnLabel: 'Playing', you: false },
        }}
      />,
    );
    await rollDie(store, 'white', 5);
    await rollDie(store, 'black', 1);
    expect(message()).toHaveTextContent('You start with 5-1.');
  });

  it('Greek: the tie and the result', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    const store = newStore({ white: 'Μαρία', black: 'Νίκος' });
    await render(<GameScreen store={store} />);
    expect(
      card().getByRole('button', { name: 'Μαρία: ρίξε, ή σύρε στο ταμπλό' }),
    ).toBeOnTheScreen();
    await rollDie(store, 'white', 4);
    expect(message()).toHaveTextContent('Μαρία: έφερε 4.');
    await rollDie(store, 'black', 4);
    expect(message()).toHaveTextContent('Ισοπαλία: και οι δύο έφεραν 4. Ρίξτε ξανά.');
    await wait(OPENING_TIE_WAIT_MS);
    await rollDie(store, 'white', 6);
    await rollDie(store, 'black', 3);
    expect(message()).toHaveTextContent('Ξεκινά: Μαρία, με 6-3.');
    expect(card().getByText('Κλείνει μόνο του σε 3 δευτ.')).toBeOnTheScreen();
    expect(card().getByRole('button', { name: 'Εντάξει' })).toBeOnTheScreen();
  });
});
