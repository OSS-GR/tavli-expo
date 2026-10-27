/**
 * The Hint button (#209): it shows on a person's turn with rolled dice when
 * there is more than one way to play them. A tap rings the Analyzer's best
 * turn on the board and says it in a line; a move, an undo or a second tap
 * takes it away. Settings → Show hints turns it off. Screen readers get the
 * same button in the move list, and hear the hint.
 */
import { InlineBotRunner, createAnalyzer, createBot } from '@tavli/bot';
import {
  applyGameAction,
  asodio,
  createBoard,
  createGameFlow,
  createSeededRng,
  fevga,
  legalNextMoves,
  plakoto,
  portes,
  resolveRules,
  rollDice,
  type BoardState,
  type DieValue,
  type GameState,
  type PerPlayer,
  type PlayerId,
  type RuleSet,
  type Variant,
} from '@tavli/engine';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { moveChoices, moveLabel } from '@/features/accessibility/moveList';
import { BOT_TIMING } from '@/features/bot/botSpeed';
import { bestRest, hintGroups, hintHasChoice } from '@/features/hint/hint';
import { hintShortText, hintSpokenText } from '@/features/hint/hintText';
import { DEFAULT_SETTINGS, type Settings } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import i18n from '@/i18n';

import { createGameStore, turnView, type GameStore } from './gameStore';
import { GameScreen, type BotSeat, type GameScreenProps } from './GameScreen';
import type { Seat } from './seats';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { renderWithRoot } from '../../../test/render';
import { countNodes, type JsonNode } from '../../../test/tree';

const SIZE = { width: 375, height: 500 };
const analyzer = createAnalyzer();

// The screen closes cards on timers, and the hint waits a tick (see test/clock.ts).
runOnFakeTimers();

let announce: jest.SpyInstance;

beforeEach(async () => {
  announce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => undefined);
  await setSettings({});
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

afterEach(() => {
  announce.mockRestore();
});

async function setSettings(patch: Partial<Settings>) {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS, ...patch });
  });
}

interface Setup {
  variant?: Variant;
  rules?: RuleSet;
  board?: BoardState;
  player?: PlayerId;
  /** The whole state to start from (it names the player to move). */
  state?: GameState;
}

/** A game where `player` is about to roll, on the screen. */
async function show(
  {
    variant = portes,
    rules = resolveRules(variant.id),
    board,
    player: given = 'white',
    state: givenState,
  }: Setup = {},
  props: Partial<GameScreenProps> = { analyzer },
): Promise<GameStore> {
  const store = createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    targetPoints: 1,
    rules,
    rng: createSeededRng(5),
  });
  const player = givenState?.toMove ?? given;
  const start = givenState ?? variant.initialState({ startingPlayer: player, rules });
  const state: GameState = board ? { ...start, board } : start;
  store.setState({
    flow: { ...store.getState().flow, game: createGameFlow({ state, starter: player }) },
  });
  await renderWithRoot(<GameScreen store={store} {...props} />);
  await act(async () => {
    fireEvent(screen.getByTestId('game-board', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...SIZE } },
    });
  });
  return store;
}

async function roll(store: GameStore, dice: [DieValue, DieValue]) {
  const player = store.getState().flow.game.state.toMove;
  await act(async () => {
    expect(store.getState().dispatch({ type: 'roll', player, dice })).toBe(true);
  });
}

/** Lets the hint's ranking run (it waits a tick after the tap). */
async function tick(ms = 0) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/** The best turn of the Analyzer for the game in the store. */
function best(store: GameStore) {
  const { state } = store.getState().flow.game;
  return analyzer.rankTurns(state, state.dice!, { top: 1 })[0]!.turn.moves;
}

/** The target rings on the board (the hint's, or a selected checker's). */
const rings = () => countNodes(screen.toJSON() as JsonNode, 'DashPathEffect');

const hintButton = () => screen.queryByTestId('hint-button');

/**
 * Plays the Analyzer's best turns with seeded dice until, after a few
 * turns, a roll has more than one turn. Returns the state before that roll.
 */
function laterChoice(variant: Variant, rules: RuleSet) {
  const rng = createSeededRng(11);
  let state = variant.initialState({ startingPlayer: 'white', rules });
  for (let turn = 0; turn < 200 && variant.result(state) === null; turn++) {
    const dice = rollDice(rng);
    const game = applyGameAction(createGameFlow({ state, starter: state.toMove }), {
      type: 'roll',
      player: state.toMove,
      dice,
    });
    if (turn >= 4 && hintHasChoice(game)) return { state, dice };
    const rolledState = { ...state, dice };
    const [first] = analyzer.rankTurns(rolledState, dice, { top: 1 });
    state = variant.applyTurn(rolledState, first!.turn);
  }
  throw new Error(`no roll with a choice in ${variant.id}`);
}

describe('<GameScreen /> Hint button (#209)', () => {
  it('shows only once the dice are rolled, with more than one turn', async () => {
    const store = await show();
    expect(store.getState().flow.game.phase).toBe('awaiting-roll');
    expect(hintButton()).toBeNull();
    await roll(store, [6, 5]);
    expect(hintButton()).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Hint' })).toBeOnTheScreen();
  });

  it('hides when the roll has only one turn', async () => {
    // One white checker can move: 24/18/13 and 24/19/13 end the same way.
    const board = createBoard(
      { white: { points: { 24: 1, 1: 14 } }, black: { points: { 2: 15 } } },
      portes.direction,
    );
    const store = await show({ board });
    await roll(store, [6, 5]);
    expect(store.getState().flow.game.phase).toBe('moving');
    expect(screen.getByTestId('undo-button')).toBeOnTheScreen();
    expect(hintButton()).toBeNull();
  });

  it('has no Hint without an Analyzer (online games, later)', async () => {
    const store = await show({}, {});
    await roll(store, [6, 5]);
    expect(screen.getByTestId('undo-button')).toBeOnTheScreen();
    expect(hintButton()).toBeNull();
  });

  it('hides on the bot’s turn', async () => {
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
    const store = await show({ player: 'black' }, { analyzer, seats, bot });
    await tick(BOT_TIMING.beforeRollMs);
    const { game } = store.getState().flow;
    expect(game.state.toMove).toBe('black');
    expect(game.phase).toBe('moving');
    expect(screen.getByTestId('bot-turn')).toBeOnTheScreen();
    expect(hintButton()).toBeNull();
  });

  it('hides with Settings → Show hints off', async () => {
    await setSettings({ showHints: false, moveList: 'on' });
    const store = await show();
    await roll(store, [6, 5]);
    expect(screen.getByTestId('move-list')).toBeOnTheScreen();
    expect(hintButton()).toBeNull();
    expect(screen.queryByTestId('move-list-hint')).toBeNull();
    // On again: the button comes back at once.
    await act(async () => {
      settingsStore.getState().setSetting('showHints', true);
    });
    expect(hintButton()).toBeOnTheScreen();
  });

  it('a tap shows the best turn: rings on the board and a line, then a second tap hides it', async () => {
    const onHintShown = jest.fn();
    const store = await show({}, { analyzer, onHintShown });
    await roll(store, [6, 5]);
    const moves = best(store);
    expect(rings()).toBe(0);
    const user = setupUser();
    await user.press(hintButton()!);
    await tick();
    expect(screen.getByTestId('hint-text')).toHaveTextContent(hintShortText(i18n.t, moves));
    expect(rings()).toBe(hintGroups(moves).length);
    expect(onHintShown).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(hintSpokenText(i18n.t, moves));
    // Nothing was played.
    expect(store.getState().flow.game.played).toEqual([]);
    expect(screen.getByRole('button', { name: 'Hide the hint' })).toBeOnTheScreen();

    await user.press(hintButton()!);
    expect(screen.queryByTestId('hint-text')).toBeNull();
    expect(rings()).toBe(0);
    expect(onHintShown).toHaveBeenCalledTimes(1);
  });

  it('shows the busy state until the ranking has run', async () => {
    const store = await show();
    await roll(store, [6, 5]);
    await act(async () => {
      fireEvent.press(hintButton()!);
    });
    expect(screen.queryByTestId('hint-text')).toBeNull();
    expect(screen.getByRole('button', { name: 'Thinking…' })).toBeDisabled();
    await tick();
    expect(screen.getByTestId('hint-text')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Hide the hint' })).toBeEnabled();
  });

  it('the marks clear after a move, and the next hint is for the rest of the turn', async () => {
    await setSettings({ moveList: 'on' });
    const store = await show();
    await roll(store, [6, 5]);
    await act(async () => {
      fireEvent.press(hintButton()!);
    });
    await tick();
    expect(screen.getByTestId('hint-text')).toBeOnTheScreen();
    expect(rings()).toBeGreaterThan(0);

    // Play a move from the move list.
    const view = turnView(store.getState().flow);
    const name = moveLabel(i18n.t, moveChoices(view.legal)[0]!);
    await act(async () => {
      fireEvent.press(within(screen.getByTestId('move-list')).getByRole('button', { name }));
    });
    expect(store.getState().flow.game.played).toHaveLength(1);
    expect(screen.queryByTestId('hint-text')).toBeNull();
    expect(rings()).toBe(0);

    // A new hint finishes the turn from here.
    await act(async () => {
      fireEvent.press(hintButton()!);
    });
    await tick();
    const rest = bestRest(store.getState().flow.game, analyzer)!;
    expect(rest).toHaveLength(1);
    expect(screen.getByTestId('hint-text')).toHaveTextContent(hintShortText(i18n.t, rest));
    expect(rings()).toBe(1);
  });

  it('Undo takes the hint away', async () => {
    const store = await show();
    await roll(store, [6, 5]);
    await act(async () => {
      store.getState().dispatch({
        type: 'move',
        player: 'white',
        move: legalNextMoves(store.getState().flow.game)[0]!.moves[0]!,
      });
    });
    await act(async () => {
      fireEvent.press(hintButton()!);
    });
    await tick();
    expect(screen.getByTestId('hint-text')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByTestId('undo-button'));
    });
    expect(store.getState().flow.game.played).toEqual([]);
    expect(screen.queryByTestId('hint-text')).toBeNull();
    expect(rings()).toBe(0);
    expect(hintButton()).toBeOnTheScreen();
  });

  it('a move before the ranking runs drops that hint', async () => {
    const onHintShown = jest.fn();
    const store = await show({}, { analyzer, onHintShown });
    await roll(store, [6, 5]);
    await act(async () => {
      fireEvent.press(hintButton()!);
      store.getState().dispatch({
        type: 'move',
        player: 'white',
        move: legalNextMoves(store.getState().flow.game)[0]!.moves[0]!,
      });
    });
    await tick();
    expect(screen.queryByTestId('hint-text')).toBeNull();
    expect(onHintShown).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Hint' })).toBeEnabled();
  });

  it('hides while the Acey-Deucey double is still to choose, and helps with the chosen double', async () => {
    const rules = resolveRules('asodio.aceyDeuceyGreek');
    const store = await show({ variant: asodio, rules });
    await roll(store, [1, 2]);
    expect(hintButton()).toBeOnTheScreen();
    const { dispatch } = store.getState();
    await act(async () => {
      for (let next = legalNextMoves(store.getState().flow.game)[0]; next;) {
        dispatch({ type: 'move', player: 'white', move: next.moves[0]! });
        next = legalNextMoves(store.getState().flow.game)[0];
      }
      dispatch({ type: 'confirm', player: 'white' });
    });
    expect(store.getState().flow.game.phase).toBe('awaiting-answer');
    expect(hintButton()).toBeNull();
    expect(screen.queryByTestId('move-list-hint')).toBeNull();
    await act(async () => {
      dispatch({ type: 'answer', player: 'white', choice: '4' });
    });
    expect(store.getState().flow.game.state.dice).toEqual([4, 4]);
    expect(hintButton()).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(hintButton()!);
    });
    await tick();
    expect(screen.getByTestId('hint-text')).toHaveTextContent(hintShortText(i18n.t, best(store)));
  });

  it.each([
    ['plakoto', plakoto, 'plakoto'],
    ['fevga', fevga, 'fevga'],
    ['asodio', asodio, 'asodio.kafeneio'],
  ] as const)('works in %s too', async (_id, variant, preset) => {
    // Some turns into the game (the first turns of Fevga and Asodio have
    // one way to play), then the first roll with more than one turn.
    const rules = resolveRules(preset);
    const { state, dice } = laterChoice(variant, rules);
    const store = await show({ variant, rules, state });
    await roll(store, dice);
    await act(async () => {
      fireEvent.press(hintButton()!);
    });
    await tick();
    expect(screen.getByTestId('hint-text')).toHaveTextContent(hintShortText(i18n.t, best(store)));
    expect(rings()).toBe(hintGroups(best(store)).length);
  });

  it('screen readers get the Hint in the move list, and hear the hint', async () => {
    await setSettings({ moveList: 'on' });
    const store = await show();
    await roll(store, [6, 5]);
    const list = within(screen.getByTestId('move-list'));
    await act(async () => {
      fireEvent.press(list.getByRole('button', { name: 'Hint' }));
    });
    await tick();
    const moves = best(store);
    expect(announce).toHaveBeenCalledWith(hintSpokenText(i18n.t, moves));
    expect(list.getByRole('button', { name: 'Hide the hint' })).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(list.getByRole('button', { name: 'Hide the hint' }));
    });
    expect(screen.queryByTestId('hint-text')).toBeNull();
  });

  it('says it in Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    const store = await show();
    await roll(store, [6, 5]);
    expect(screen.getByRole('button', { name: 'Υπόδειξη' })).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(hintButton()!);
    });
    await tick();
    expect(screen.getByTestId('hint-text')).toHaveTextContent(/^Υπόδειξη: /);
    expect(screen.getByRole('button', { name: 'Κρύψε την υπόδειξη' })).toBeOnTheScreen();
  });
});
