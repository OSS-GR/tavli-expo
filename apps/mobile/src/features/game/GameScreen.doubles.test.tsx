/**
 * A double shows its two dice first, then splits into four (#177).
 * The owner's play test: "the 4 dice show up before the user can understand
 * he rolled doubles."
 */
import { InlineBotRunner, createBot } from '@tavli/bot';
import {
  asodio,
  createGameFlow,
  createSeededRng,
  legalNextMoves,
  portes,
  resolveRules,
  type PerPlayer,
  type PlayerId,
  type Rng,
} from '@tavli/engine';
import { getTheme } from '@tavli/themes';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import { boardLayout } from '@/features/board/BoardCanvas';
import { boardDiceBox, columnDiceBox } from '@/features/board/boardDice';
import { DOUBLE_SPLIT_AT_MS, USED_OPACITY, doublePlaces } from '@/features/board/diceMotion';
import { boxRatioWithShadow, fitBoardWithShadow } from '@/features/board/geometry';
import { SIDE_COLUMN } from '@/features/board/screenLayout';
import { DOUBLE_LABEL_MS } from '@/features/board/useDoubleReveal';
import { BOT_TIMING } from '@/features/bot/botSpeed';
import { DEFAULT_SETTINGS, type BoardLayoutMode } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import i18n from '@/i18n';

import { createGameStore, type GameStore } from './gameStore';
import { GameScreen, type BotSeat } from './GameScreen';
import type { Seat } from './seats';

import { runOnFakeTimers } from '../../../test/clock';
import { nativeParent, nativePath } from '../../../test/nativeParent';
import { renderWithRoot } from '../../../test/render';
import { findAllNodes, type JsonNode } from '../../../test/tree';
import { LANDSCAPE_SE, resetWindow, setWindow } from '../../../test/window';

const theme = getTheme('walnut-kafeneio');
/** The space each layout gives the board on an iPhone SE (375 pt wide). */
const SPACE: Readonly<Record<BoardLayoutMode, { width: number; height: number }>> = {
  tall: { width: 375, height: 500 },
  classic: { width: 375, height: 375 / boxRatioWithShadow(theme.layouts.landscape) },
};
const SIZE = SPACE.tall;
/** The board's space in landscape on an iPhone SE: between the two side columns. */
const LANDSCAPE_SPACE = { width: 667 - 2 * 4 - 2 * SIDE_COLUMN, height: 360 };

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

async function show(
  store: GameStore,
  props: Partial<ComponentProps<typeof GameScreen>> = {},
  size = SIZE,
) {
  await renderWithRoot(<GameScreen store={store} {...props} />);
  await act(async () => {
    fireEvent(screen.getByTestId('game-board', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...size } },
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

afterEach(async () => {
  announce.mockRestore();
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
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

  it('a move before the split shows no late "Doubles!" label', async () => {
    const store = newStore();
    toRoll(store, 'white');
    await show(store);
    await act(async () => {
      store.getState().dispatch({ type: 'roll', player: 'white', dice: [3, 3] });
    });
    await tick(DOUBLE_SPLIT_AT_MS - 200);
    const move = legalNextMoves(store.getState().flow.game)[0]!.moves[0]!;
    await act(async () => {
      store.getState().dispatch({ type: 'move', player: 'white', move });
    });
    expect(diceDrawn()).toBe(4);
    // Three dice are left, so no other note shows. The label must not come late.
    for (let ms = 0; ms <= 200 + DOUBLE_LABEL_MS; ms += 100) {
      expect(doublesHint()).toBeNull();
      await tick(100);
    }
    expect(screen.queryByTestId('confirm-hint')).toBeNull();
    expect(diceDrawn()).toBe(4);
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

  it('a double chosen after a 1-2 (Acey-Deucey) shows four dice at rest at once, no label', async () => {
    const rules = resolveRules('asodio.aceyDeuceyGreek');
    const store = createGameStore({
      players: { white: 'Ann', black: 'Bob' },
      targetPoints: 1,
      rules,
      rng: createSeededRng(5),
    });
    const { flow } = store.getState();
    const state = asodio.initialState({ startingPlayer: 'white', rules });
    store.setState({ flow: { ...flow, game: createGameFlow({ state, starter: 'white' }) } });
    await show(store);
    const { dispatch } = store.getState();
    await act(async () => {
      dispatch({ type: 'roll', player: 'white', dice: [1, 2] });
    });
    await act(async () => {
      for (let next = legalNextMoves(store.getState().flow.game)[0]; next;) {
        dispatch({ type: 'move', player: 'white', move: next.moves[0]! });
        next = legalNextMoves(store.getState().flow.game)[0];
      }
      dispatch({ type: 'confirm', player: 'white' });
    });
    expect(store.getState().flow.game.phase).toBe('awaiting-answer');
    await tick(DOUBLE_SPLIT_AT_MS + DOUBLE_LABEL_MS);
    await act(async () => {
      dispatch({ type: 'answer', player: 'white', choice: '4' });
    });
    expect(store.getState().flow.game.state.dice).toEqual([4, 4]);
    // No roll: the four dice show at once, not a pair first.
    expect(diceDrawn()).toBe(4);
    expect(diceOpacity()).toEqual([1, 1, 1, 1]);
    expect(screen.getByLabelText('Dice 4-4-4-4, 4 left to play')).toBeOnTheScreen();
    const canvas = screen.getByTestId('dice-row');
    const parent = nativeParent(canvas);
    expect(parent?.props.collapsable).toBe(false);
    // No split and no late "Doubles!" label.
    for (let ms = 0; ms <= DOUBLE_SPLIT_AT_MS + DOUBLE_LABEL_MS; ms += 100) {
      expect(screen.queryByTestId('doubles-hint')).toBeNull();
      expect(diceDrawn()).toBe(4);
      await tick(100);
    }
    expect(screen.getByTestId('dice-row') === canvas).toBe(true);
    expect(nativeParent(screen.getByTestId('dice-row')) === parent).toBe(true);
  });

  // Greek names each double by its value (the owner's words), in the label
  // and in what screen readers hear.
  it.each([
    [1, 'Ασσάκια!', 'ασσάκια'],
    [2, 'Δυάρες!', 'δυάρες'],
    [3, 'Τριάρες!', 'τριάρες'],
    [4, 'Τεσσάρες!', 'τεσσάρες'],
    [5, 'Πεντάρες!', 'πεντάρες'],
    [6, 'Εξάρες!', 'εξάρες'],
  ] as const)('names %i-%i in Greek: «%s»', async (value, label, name) => {
    await i18n.changeLanguage('el');
    const store = newStore();
    toRoll(store, 'white');
    const seats: PerPlayer<Seat> = {
      white: { name: 'Εσύ', label: 'Εσύ', turnLabel: 'Σειρά σου', you: true },
      black: { name: 'Bob', label: 'Bob', turnLabel: 'Παίζει', you: false },
    };
    await show(store, { seats });
    await act(async () => {
      store.getState().dispatch({ type: 'roll', player: 'white', dice: [value, value] });
    });
    expect(screen.queryByText(label)).toBeNull();
    await tick(DOUBLE_SPLIT_AT_MS);
    expect(screen.getByTestId('doubles-hint')).toHaveTextContent(label);
    expect(announce).toHaveBeenCalledWith(`Έφερες ${name}: τέσσερις κινήσεις του ${value}.`);
    expect(announce.mock.calls.filter(([t]) => /διπλ/i.test(String(t)))).toHaveLength(0);
  });

  describe.each(['tall', 'classic'] as const)('on the %s board (#184)', (layout) => {
    it('splits on the board, in a box that does not move, with the canvas in place', async () => {
      await act(async () => {
        settingsStore.setState({ ...DEFAULT_SETTINGS, boardLayout: layout });
      });
      const store = newStore();
      toRoll(store, 'white');
      await show(store, {}, SPACE[layout]);
      await act(async () => {
        store.getState().dispatch({ type: 'roll', player: 'white', dice: [6, 6] });
      });
      const geo = fitBoardWithShadow(boardLayout(theme, layout, 'right'), SPACE[layout]);
      const want = boardDiceBox(geo, 4);
      const box = () => screen.getByTestId('board-dice');
      const at = { left: want.left, top: want.top };
      expect(box().props.style).toEqual(expect.arrayContaining([expect.objectContaining(at)]));
      // The two rolled dice lie on the board, at the size of any roll.
      const layer = screen.getByTestId('game-board-layer');
      expect(within(layer).getByLabelText('Dice 6-6-6-6, 4 left to play')).toBeOnTheScreen();
      expect(diceDrawn()).toBe(2);
      expect(want.pairSize).toBe(boardDiceBox(geo, 2).size);
      expect(doublePlaces(want.size, want.pairSize).width).toBe(want.width);
      const canvas = screen.getByTestId('dice-row');
      const path = nativePath(canvas);

      await tick(DOUBLE_SPLIT_AT_MS);
      expect(diceDrawn()).toBe(4);
      expect(doublesHint()).toBeOnTheScreen();
      // The box stays where it was; the canvas keeps its native views (#173).
      expect(box().props.style).toEqual(expect.arrayContaining([expect.objectContaining(at)]));
      expect(screen.getByTestId('dice-row') === canvas).toBe(true);
      expect(nativePath(screen.getByTestId('dice-row'))).toBe(path);
    });
  });
  describe('in landscape (#185)', () => {
    beforeEach(async () => {
      await setWindow(LANDSCAPE_SE);
    });
    afterEach(async () => {
      await resetWindow();
    });

    it('splits in the right column: the box and the slot do not move, the canvas stays', async () => {
      const store = newStore();
      toRoll(store, 'white');
      await show(store, {}, LANDSCAPE_SPACE);
      const geo = fitBoardWithShadow(boardLayout(theme, 'classic', 'right'), LANDSCAPE_SPACE);
      const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);
      await act(async () => {
        store.getState().dispatch({ type: 'roll', player: 'white', dice: [5, 5] });
      });
      const want = columnDiceBox(geo, SIDE_COLUMN, 4);
      const two = columnDiceBox(geo, SIDE_COLUMN, 2);
      // The two rolled dice are the size of any roll, and the box fits the column.
      expect(want.pairSize).toBe(two.size);
      expect(doublePlaces(want.size, want.pairSize).width).toBe(want.width);
      expect(want.left).toBeGreaterThanOrEqual(LANDSCAPE_SPACE.width);
      expect(want.left + want.width).toBeLessThanOrEqual(LANDSCAPE_SPACE.width + SIDE_COLUMN);
      expect(flat('board-dice')).toMatchObject({ left: want.left, top: want.top });
      // The right column keeps a slot as tall as the four dice.
      expect(flat('game-dice-slot')).toMatchObject({ height: want.height });
      expect(diceDrawn()).toBe(2);
      const canvas = screen.getByTestId('dice-row');
      const parent = nativeParent(canvas);
      const path = nativePath(canvas);

      await tick(DOUBLE_SPLIT_AT_MS);
      expect(diceDrawn()).toBe(4);
      expect(doublesHint()).toBeOnTheScreen();
      expect(flat('board-dice')).toMatchObject({ left: want.left, top: want.top });
      expect(flat('game-dice-slot')).toMatchObject({ height: want.height });
      expect(screen.getByTestId('dice-row') === canvas).toBe(true);
      expect(nativeParent(screen.getByTestId('dice-row')) === parent).toBe(true);
      expect(nativePath(screen.getByTestId('dice-row'))).toBe(path);
    });
  });
});
