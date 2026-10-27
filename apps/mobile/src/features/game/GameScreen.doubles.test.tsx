/**
 * A double shows its two dice first, then splits into four (#177).
 * The owner's play test: "the 4 dice show up before the user can understand
 * he rolled doubles."
 */
import { InlineBotRunner, createBot } from '@tavli/bot';
import {
  createGameFlow,
  createSeededRng,
  legalNextMoves,
  portes,
  type PerPlayer,
  type PlayerId,
  type Rng,
} from '@tavli/engine';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { AccessibilityInfo } from 'react-native';

import { DOUBLE_SPLIT_AT_MS, USED_OPACITY } from '@/features/board/diceMotion';
import { DOUBLE_LABEL_MS } from '@/features/board/useDoubleReveal';
import { BOT_TIMING } from '@/features/bot/botSpeed';
import i18n from '@/i18n';

import { createGameStore, type GameStore } from './gameStore';
import { GameScreen, type BotSeat } from './GameScreen';
import type { Seat } from './seats';

import { runOnFakeTimers } from '../../../test/clock';
import { nativeParent } from '../../../test/nativeParent';
import { renderWithRoot } from '../../../test/render';
import { findAllNodes, type JsonNode } from '../../../test/tree';

const SIZE = { width: 375, height: 500 };

/** Rolls 4 on every die: each roll is 4-4. */
const fours: Rng = { nextUint32: () => 3 };

function newStore(rng: Rng = createSeededRng(5)): GameStore {
  return createGameStore({ players: { white: 'Ann', black: 'Bob' }, targetPoints: 3, rng });
}

/** The start position, with `player` to roll (no opening roll). */
function toRoll(store: GameStore, player: PlayerId) {
  const { flow } = store.getState();
  const state = portes.initialState({ startingPlayer: player });
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

const tick = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

/** The dice the dice row draws now. Each is a Group that moves (`transform`). */
function diceGroups(): JsonNode[] {
  const tree = screen.toJSON() as JsonNode | JsonNode[] | null;
  const [canvas] = findAllNodes(tree, (n) => n.type === 'Canvas' && n.props.testID === 'dice-row');
  if (canvas === undefined) return [];
  return findAllNodes(canvas, (n) => n.type === 'Group' && n.props.transform !== undefined);
}
const diceDrawn = () => diceGroups().length;
/** The opacity of each die, in grid order. */
const diceOpacity = () => diceGroups().map((g) => (g.props.opacity as { value: number }).value);

const doublesHint = () => screen.queryByText('Doubles!');

let announce: jest.SpyInstance;

// The split and the label run on timers, and so does the bot.
runOnFakeTimers();

beforeEach(async () => {
  await i18n.changeLanguage('en');
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
});

afterEach(() => {
  announce.mockRestore();
});

describe('<GameScreen /> doubles (#177)', () => {
  it('shows the two dice first, then four dice and "Doubles!" a beat after they land', async () => {
    const store = newStore();
    toRoll(store, 'white');
    await show(store);
    await act(async () => {
      store.getState().dispatch({ type: 'roll', player: 'white', dice: [4, 4] });
    });
    // The two rolled dice, as for any roll.
    expect(diceDrawn()).toBe(2);
    expect(doublesHint()).toBeNull();
    // The canvas says what the dice are worth from the start.
    expect(screen.getByLabelText('Dice 4-4-4-4, 4 left to play')).toBeOnTheScreen();

    await tick(DOUBLE_SPLIT_AT_MS - 1);
    expect(diceDrawn()).toBe(2);
    expect(doublesHint()).toBeNull();
    await tick(1);
    expect(diceDrawn()).toBe(4);
    expect(doublesHint()).toBeOnTheScreen();

    // The label is short; the four dice stay.
    await tick(DOUBLE_LABEL_MS - 1);
    expect(doublesHint()).toBeOnTheScreen();
    await tick(1);
    expect(doublesHint()).toBeNull();
    expect(diceDrawn()).toBe(4);
  });

  it('screen readers hear "You rolled double 4: four moves of 4" once', async () => {
    const store = newStore();
    toRoll(store, 'white');
    const seats: PerPlayer<Seat> = {
      white: { name: 'You', label: 'You', turnLabel: 'Your turn', you: true },
      black: { name: 'Bob', label: 'Bob', turnLabel: 'Playing', you: false },
    };
    await show(store, { seats });
    await act(async () => {
      store.getState().dispatch({ type: 'roll', player: 'white', dice: [4, 4] });
    });
    await tick(DOUBLE_SPLIT_AT_MS);
    // The "Doubles!" label is for the eyes: the announcement already says it.
    expect(screen.getByTestId('doubles-hint')).toHaveProp('accessible', false);
    expect(screen.getByTestId('doubles-hint')).toHaveProp('importantForAccessibility', 'no');
    await tick(DOUBLE_LABEL_MS);
    const said = announce.mock.calls.map(([text]) => String(text));
    expect(said.filter((t) => t === 'You rolled double 4: four moves of 4.')).toHaveLength(1);
    // Nothing else says the double while the dice split.
    expect(said.filter((t) => /double/i.test(t))).toHaveLength(1);
  });

  it('keeps one dice canvas in the same native view through the split (#173)', async () => {
    const store = newStore();
    toRoll(store, 'white');
    await show(store);
    await act(async () => {
      store.getState().dispatch({ type: 'roll', player: 'white', dice: [5, 5] });
    });
    const canvas = screen.getByTestId('dice-row');
    const parent = nativeParent(canvas);
    expect(parent?.props.collapsable).toBe(false);
    await tick(DOUBLE_SPLIT_AT_MS);
    expect(diceDrawn()).toBe(4);
    const after = screen.getByTestId('dice-row');
    expect(after === canvas).toBe(true);
    expect(nativeParent(after) === parent).toBe(true);
  });

  it('used dice grey out one by one, and a quick move shows the four dice at once', async () => {
    const store = newStore();
    toRoll(store, 'white');
    await show(store);
    await act(async () => {
      store.getState().dispatch({ type: 'roll', player: 'white', dice: [3, 3] });
    });
    expect(diceDrawn()).toBe(2);
    const play = async () => {
      const move = legalNextMoves(store.getState().flow.game)[0]!.moves[0]!;
      await act(async () => {
        store.getState().dispatch({ type: 'move', player: 'white', move });
      });
    };
    // A move before the split: the used die is one of four.
    await play();
    expect(diceDrawn()).toBe(4);
    expect(screen.getByLabelText('Dice 3-3-3-3, 3 left to play')).toBeOnTheScreen();
    // An undo does not take the four dice back to two.
    await act(async () => {
      store.getState().dispatch({ type: 'undo', player: 'white' });
    });
    expect(screen.getByLabelText('Dice 3-3-3-3, 4 left to play')).toBeOnTheScreen();
    expect(diceDrawn()).toBe(4);
    await play();
    expect(diceOpacity()).toEqual([USED_OPACITY, 1, 1, 1]);
    await play();
    expect(screen.getByLabelText('Dice 3-3-3-3, 2 left to play')).toBeOnTheScreen();
    expect(diceOpacity()).toEqual([USED_OPACITY, USED_OPACITY, 1, 1]);
    await play();
    expect(diceOpacity()).toEqual([USED_OPACITY, USED_OPACITY, USED_OPACITY, 1]);
    await play();
    expect(diceOpacity()).toEqual([USED_OPACITY, USED_OPACITY, USED_OPACITY, USED_OPACITY]);
    expect(screen.getByLabelText('Dice 3-3-3-3, 0 left to play')).toBeOnTheScreen();
    // "All dice used" wins over "Doubles!": one note at a time.
    await tick(DOUBLE_SPLIT_AT_MS);
    expect(screen.getByTestId('confirm-hint')).toBeOnTheScreen();
    expect(doublesHint()).toBeNull();
  });

  it('a roll that is not a double shows its two dice and no label', async () => {
    const store = newStore();
    toRoll(store, 'white');
    await show(store);
    await act(async () => {
      store.getState().dispatch({ type: 'roll', player: 'white', dice: [6, 2] });
    });
    expect(diceDrawn()).toBe(2);
    await tick(DOUBLE_SPLIT_AT_MS + DOUBLE_LABEL_MS);
    expect(diceDrawn()).toBe(2);
    expect(doublesHint()).toBeNull();
  });

  it('the bot’s double splits too, and its first move waits for the four dice', async () => {
    const store = newStore(fours);
    toRoll(store, 'black');
    const seats: PerPlayer<Seat> = {
      white: { name: 'You', label: 'You', turnLabel: 'Your turn', you: true },
      black: { name: 'Bot', label: 'Bot · Easy', turnLabel: 'Playing', you: false },
    };
    const bot: BotSeat = {
      player: 'black',
      difficulty: 'easy',
      runner: new InlineBotRunner(createBot()),
      rng: createSeededRng(1),
      timing: { thinkMs: () => 0 },
    };
    await show(store, { seats, bot });
    const { beforeRollMs, afterRollMs, doubleMs } = BOT_TIMING;
    await tick(beforeRollMs);
    expect(store.getState().flow.game.state.dice).toEqual([4, 4]);
    expect(diceDrawn()).toBe(2);
    expect(announce).toHaveBeenCalledWith('Bot rolled double 4: four moves of 4.');

    await tick(DOUBLE_SPLIT_AT_MS);
    expect(diceDrawn()).toBe(4);
    expect(doublesHint()).toBeOnTheScreen();
    expect(store.getState().flow.game.played).toHaveLength(0);

    // The first move comes after the four dice show and a pause.
    await tick(afterRollMs + doubleMs - DOUBLE_SPLIT_AT_MS - 1);
    expect(store.getState().flow.game.played).toHaveLength(0);
    await tick(1);
    expect(store.getState().flow.game.played).toHaveLength(1);
    expect(screen.getByLabelText('Dice 4-4-4-4, 3 left to play')).toBeOnTheScreen();
  });

  it('says "Doubles!" in Greek', async () => {
    await i18n.changeLanguage('el');
    const store = newStore();
    toRoll(store, 'white');
    await show(store);
    await act(async () => {
      store.getState().dispatch({ type: 'roll', player: 'white', dice: [2, 2] });
    });
    await tick(DOUBLE_SPLIT_AT_MS);
    expect(screen.getByText('Διπλές!')).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith('Ann: έφερε διπλές 2: τέσσερις κινήσεις του 2.');
  });
});
