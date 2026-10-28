/**
 * The "choose a double" card (#205). In the Acey-Deucey presets of Asodio a
 * played 1-2 lets the player choose a double (`chooseDouble`). A person
 * answers on a card with six dice buttons; the bot answers by itself, so it
 * gets no card. A chosen double that no checker can play passes, and the
 * pass card says "chose", not "rolled".
 */
import { InlineBotRunner, createBot } from '@tavli/bot';
import {
  asodio,
  createBoard,
  createGameFlow,
  createSeededRng,
  legalNextMoves,
  resolveRules,
  type BoardState,
  type DieValue,
  type MatchAction,
  type PerPlayer,
  type PlayerId,
  type Rng,
} from '@tavli/engine';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import { BOARD_LAYOUT_MODES, DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import i18n from '@/i18n';

import { createGameStore, turnView, type GameStore } from './gameStore';
import { GameScreen, type BotSeat } from './GameScreen';
import { diceWereChosen } from './rolledDice';
import type { Seat } from './seats';

import { runOnFakeTimers } from '../../../test/clock';
import { renderWithRoot } from '../../../test/render';
import { LANDSCAPE_SE, PORTRAIT_SE, resetWindow, setWindow } from '../../../test/window';

const SIZE = { width: 375, height: 520 };
const hidden = { includeHiddenElements: true };
const rules = resolveRules('asodio.aceyDeuceyGreek');
const VALUES: readonly DieValue[] = [1, 2, 3, 4, 5, 6];
const youVsBot: PerPlayer<Seat> = {
  white: { name: 'You', label: 'You', turnLabel: 'Your turn', you: true },
  black: { name: 'Bot', label: 'Bot · Easy', turnLabel: 'Playing', you: false },
};

/** An Acey-Deucey game, `player` to roll; from the empty board unless `board` is given. */
function aceyDeucey(player: PlayerId, board?: BoardState, rng: Rng = createSeededRng(5)) {
  const store = createGameStore({ players: { white: 'Ann', black: 'Bob' }, rules, rng });
  const initial = asodio.initialState({ startingPlayer: player, rules });
  const state = board ? { ...initial, board } : initial;
  store.setState({
    flow: { ...store.getState().flow, game: createGameFlow({ state, starter: player }) },
  });
  return store;
}

async function show(store: GameStore, props: Partial<ComponentProps<typeof GameScreen>> = {}) {
  await renderWithRoot(<GameScreen store={store} {...props} />);
  await act(async () => {
    fireEvent(screen.getByTestId('game-board', hidden), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...SIZE } },
    });
  });
}

const send = async (store: GameStore, action: MatchAction) => {
  await act(async () => {
    expect(store.getState().dispatch(action)).toBe(true);
  });
};

/** White rolls 1-2 and plays `moves` (default: the first legal ones): the question is open. */
async function whitePlaysAceDeuce(store: GameStore, moves?: readonly [string, string]) {
  await send(store, { type: 'roll', player: 'white', dice: [1, 2] });
  for (let i = 0; i < 2; i++) {
    const legal = legalNextMoves(store.getState().flow.game).flatMap((s) => s.moves);
    const move = moves ? legal.find((m) => `${m.from}/${m.to}` === moves[i]) : legal[0];
    await send(store, { type: 'move', player: 'white', move: move! });
  }
  await send(store, { type: 'confirm', player: 'white' });
  expect(store.getState().flow.game.phase).toBe('awaiting-answer');
}

const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

/** A card covers the board: screen readers skip the board, the move list is gone. */
function expectBoardHidden() {
  expect(screen.queryByTestId('game-board')).toBeNull();
  const layer = screen.getByTestId('game-board-layer', hidden);
  expect(layer).toHaveProp('importantForAccessibility', 'no-hide-descendants');
  expect(layer).toHaveProp('accessibilityElementsHidden', true);
  expect(screen.queryByTestId('move-list')).toBeNull();
}

let announce: jest.SpyInstance;
let focus: jest.SpyInstance;
const said = () => announce.mock.calls.map(([text]) => String(text));

runOnFakeTimers();

beforeEach(async () => {
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
    await i18n.changeLanguage('en');
  });
});

afterEach(() => {
  announce.mockRestore();
  focus.mockRestore();
});

afterAll(async () => {
  await i18n.changeLanguage('en');
});

describe('<GameScreen /> the "choose a double" card (#205)', () => {
  it('asks the person who rolled 1-2, with six dice buttons; not the mother card', async () => {
    const store = aceyDeucey('white');
    await show(store);
    await whitePlaysAceDeuce(store);

    const card = within(screen.getByTestId('choose-double-card'));
    expect(screen.queryByTestId('mother-card')).toBeNull();
    expect(card.getByText('Ann, you rolled 1-2')).toBeOnTheScreen();
    expect(card.getByText('Choose a double:')).toBeOnTheScreen();
    for (const value of VALUES) {
      expect(card.getByTestId(`choose-double-${value}`)).toBeOnTheScreen();
      expect(
        card.getByRole('button', { name: `double ${value}: four moves of ${value}` }),
      ).toBeOnTheScreen();
    }
    // Nothing else to press: no Roll, and Undo · Confirm are off.
    expect(screen.queryByTestId('roll-button')).toBeNull();
    expect(screen.queryByTestId('pass-card')).toBeNull();
  });

  it.each(VALUES)('a person chooses %i: the turn starts with that double', async (value) => {
    const store = aceyDeucey('white');
    await show(store);
    await whitePlaysAceDeuce(store);
    await press(`choose-double-${value}`);

    const { flow } = store.getState();
    expect(flow.game.phase).toBe('moving');
    expect(flow.game.state.toMove).toBe('white');
    expect(flow.game.state.dice).toEqual([value, value]);
    expect(diceWereChosen(flow, [value, value])).toBe(true);
    expect(flow.log.at(-1)).toEqual({ type: 'answer', player: 'white', choice: String(value) });
    // The card is gone and the board is back, with moves of the chosen die.
    expect(screen.queryByTestId('choose-double-card')).toBeNull();
    expect(screen.getByTestId('game-board')).toBeOnTheScreen();
    const view = turnView(flow);
    expect(view.legal.length).toBeGreaterThan(0);
    for (const source of view.legal) {
      for (const move of source.moves) expect(move.die).toBe(value);
    }
    expect(screen.getByTestId('dice-row', hidden)).toBeTruthy();
  });

  it('screen readers: the card hides the board, takes focus and reads itself', async () => {
    const store = aceyDeucey('white');
    await show(store, { seats: youVsBot });
    focus.mockClear();
    await whitePlaysAceDeuce(store);
    expect(screen.getByTestId('choose-double-card')).toBeOnTheScreen();
    expectBoardHidden();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
    expect(said()).toContain('You rolled 1-2 Choose a double:');

    await press('choose-double-3');
    expect(screen.getByTestId('game-board')).toBeOnTheScreen();
    expect(screen.getByTestId('game-board-layer')).toHaveProp('importantForAccessibility', 'auto');
    expect(said().filter((t) => t === 'You chose double 3: four moves of 3.')).toHaveLength(1);
  });

  it('with the move list: answer by the button name, then play the double from the list', async () => {
    await act(async () => {
      settingsStore.setState({ ...DEFAULT_SETTINGS, moveList: 'on' });
    });
    const store = aceyDeucey('white');
    await show(store);
    await whitePlaysAceDeuce(store);
    // The list waits while the card asks; the card's buttons are the choices.
    expect(screen.queryByTestId('move-list')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'double 5: four moves of 5' }));
    });
    expect(store.getState().flow.game.state.dice).toEqual([5, 5]);
    const list = within(screen.getByTestId('move-list'));
    const buttons = list.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.press(buttons[0]!);
    });
    const played = store.getState().flow.game.played;
    expect(played).toHaveLength(1);
    expect(played[0]!.die).toBe(5);
  });

  it('in Greek: the title and the names of the doubles', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    const store = aceyDeucey('white');
    await show(store, { seats: youVsBot });
    await whitePlaysAceDeuce(store);
    const card = within(screen.getByTestId('choose-double-card'));
    expect(card.getByText('Έφερες ασόδυο (1-2)')).toBeOnTheScreen();
    expect(card.getByText('Διάλεξε ποιες διπλές θα παίξεις:')).toBeOnTheScreen();
    const names = ['ασσάκια', 'δυάρες', 'τριάρες', 'τεσσάρες', 'πεντάρες', 'εξάρες'];
    names.forEach((name, i) => {
      expect(within(card.getByTestId(`choose-double-${i + 1}`)).getByText(name)).toBeOnTheScreen();
      expect(
        card.getByRole('button', { name: `${name}: τέσσερις κινήσεις του ${i + 1}` }),
      ).toBeOnTheScreen();
    });
    expect(said()).toContain('Έφερες ασόδυο (1-2) Διάλεξε ποιες διπλές θα παίξεις:');
  });

  describe('in portrait (#184)', () => {
    afterEach(async () => {
      await resetWindow();
    });

    it.each(BOARD_LAYOUT_MODES)('shows on the %s board, three buttons a row', async (layout) => {
      await setWindow(PORTRAIT_SE);
      await act(async () => {
        settingsStore.getState().setSetting('boardLayout', layout);
      });
      const store = aceyDeucey('white');
      await show(store);
      await whitePlaysAceDeuce(store);
      expect(screen.getByTestId('choose-double-card')).toBeOnTheScreen();
      expectBoardHidden();
      const style = StyleSheet.flatten(screen.getByTestId('choose-double-1').props.style);
      expect(style.width).toBe('30%');
      await press('choose-double-6');
      expect(store.getState().flow.game.state.dice).toEqual([6, 6]);
    });

    it('a large font gives two buttons a row', async () => {
      await setWindow({ ...PORTRAIT_SE, fontScale: 2 });
      const store = aceyDeucey('white');
      await show(store);
      await whitePlaysAceDeuce(store);
      const style = StyleSheet.flatten(screen.getByTestId('choose-double-1').props.style);
      expect(style.width).toBe('47%');
    });
  });

  describe('in landscape (#185)', () => {
    afterEach(async () => {
      await resetWindow();
    });

    it('sits beside the right column; a large font gives two buttons a row', async () => {
      await setWindow({ ...LANDSCAPE_SE, fontScale: 2 });
      const store = aceyDeucey('white');
      await show(store);
      await whitePlaysAceDeuce(store);
      expect(screen.getByTestId('game-right', hidden)).toBeTruthy();
      expect(screen.getByTestId('choose-double-card')).toBeOnTheScreen();
      expectBoardHidden();
      // The card scrolls beside the right column, never under it.
      const overlay = screen.getByTestId('game-card-overlay');
      expect(overlay.type).toBe('RCTScrollView');
      expect(StyleSheet.flatten(overlay.props.style).right).toBeGreaterThan(0);
      const style = StyleSheet.flatten(screen.getByTestId('choose-double-1').props.style);
      expect(style.width).toBe('47%');
      await press('choose-double-2');
      expect(store.getState().flow.game.state.dice).toEqual([2, 2]);
    });

    it('turning the phone keeps the open card', async () => {
      const store = aceyDeucey('white');
      await show(store);
      await whitePlaysAceDeuce(store);
      const card = screen.getByTestId('choose-double-card');
      await setWindow(LANDSCAPE_SE);
      expect(screen.getByTestId('choose-double-card')).toBe(card);
      await press('choose-double-4');
      expect(store.getState().flow.game.state.dice).toEqual([4, 4]);
    });
  });
});

/**
 * After the 1-2 (24/23, 24/22) White has checkers on own 24, 23 and 22 only.
 * Bob holds White's own 18 to 15, so a chosen 6-6 has no move.
 */
const NO_SIXES: BoardState = createBoard(
  {
    white: { points: { 24: 15 } },
    black: { points: { 7: 2, 8: 2, 9: 2, 10: 2, 12: 7 } },
  },
  'contrary',
);

describe('<GameScreen /> a chosen double with no move passes (#205)', () => {
  it('the pass card says "Ann chose 6-6", not "rolled"', async () => {
    const store = aceyDeucey('white', NO_SIXES);
    await show(store);
    await whitePlaysAceDeuce(store, ['24/23', '24/22']);
    await press('choose-double-6');

    const { flow } = store.getState();
    expect(flow.game.lastTurn).toMatchObject({ player: 'white', dice: [6, 6], moves: [] });
    expect(flow.game.state.toMove).toBe('black');
    const card = within(screen.getByTestId('pass-card'));
    expect(card.getByText('No legal moves')).toBeOnTheScreen();
    expect(card.getByText('Ann chose 6-6. No checker can move.')).toBeOnTheScreen();
    expect(card.getByText('The turn passes to Bob.')).toBeOnTheScreen();
    expect(said().some((t) => /rolled 6-6/.test(t))).toBe(false);

    await press('pass-ok-button');
    expect(screen.queryByTestId('pass-card')).toBeNull();
    // Bob's own roll is "rolled" again.
    await send(store, { type: 'roll', player: 'black', dice: [5, 3] });
    expect(said()).toContain('Bob rolled 5-3.');
  });

  it('"You chose 6-6" vs the bot, and «Διάλεξες 6-6» in Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    const store = aceyDeucey('white', NO_SIXES);
    await show(store, { seats: youVsBot });
    await whitePlaysAceDeuce(store, ['24/23', '24/22']);
    await press('choose-double-6');
    const card = within(screen.getByTestId('pass-card'));
    expect(card.getByText('Διάλεξες 6-6. Κανένα πούλι δεν μπορεί να κινηθεί.')).toBeOnTheScreen();
  });

  it('a rolled pass still says "rolled"', async () => {
    const store = aceyDeucey('white', NO_SIXES);
    await show(store);
    // 6-6 rolled: no move either, but it was rolled.
    await send(store, { type: 'roll', player: 'white', dice: [6, 6] });
    expect(
      within(screen.getByTestId('pass-card')).getByText('Ann rolled 6-6. No checker can move.'),
    ).toBeOnTheScreen();
  });
});

describe('<GameScreen /> the bot chooses by itself (#205)', () => {
  it('no card shows; its box says "Bot chose N-N"', async () => {
    // The first roll is 1-2 (the bot's), then seeded dice.
    const seeded = createSeededRng(7);
    const first = [0, 1];
    const rng: Rng = { nextUint32: () => first.shift() ?? seeded.nextUint32() };
    const store = aceyDeucey('black', undefined, rng);
    const bot: BotSeat = {
      player: 'black',
      difficulty: 'easy',
      runner: new InlineBotRunner(createBot()),
      rng: createSeededRng(1),
      timing: { thinkMs: () => 0 },
    };
    await show(store, { seats: youVsBot, bot });
    const chosen = () => {
      const { flow } = store.getState();
      const dice = flow.game.state.dice;
      return dice !== null && diceWereChosen(flow, dice);
    };
    let asked = false;
    for (let guard = 0; guard < 200 && !chosen(); guard++) {
      if (store.getState().flow.game.phase === 'awaiting-answer') asked = true;
      expect(screen.queryByTestId('choose-double-card', hidden)).toBeNull();
      expect(screen.queryByTestId('mother-card', hidden)).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(50);
      });
    }
    expect(chosen()).toBe(true);
    expect(asked || store.getState().flow.log.some((e) => e.type === 'answer')).toBe(true);
    expect(screen.queryByTestId('choose-double-card', hidden)).toBeNull();
    const [value] = store.getState().flow.game.state.dice!;
    expect(screen.getByTestId('bot-turn')).toHaveTextContent(
      `Bot chose ${value}-${value} and is moving…`,
    );
  });
});
