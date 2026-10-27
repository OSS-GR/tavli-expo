/**
 * Plakoto and Fevga on the board screen (#108): a whole game of each with
 * taps only, the pins and the Fevga start on screen, and the Plakoto mother
 * question in pass-and-play and vs the bot.
 */
import type { BotRunner } from '@tavli/contracts';
import {
  VARIANT_REGISTRY,
  createBoard,
  createGameFlow,
  createSeededRng,
  getVariant,
  plakoto,
  resolveRules,
  type BoardState,
  type MatchAction,
  type PerPlayer,
  type Turn,
} from '@tavli/engine';
import { getLayout, getTheme } from '@tavli/themes';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import { fitBoardWithShadow } from '@/features/board/geometry';
import { buildSources } from '@/features/board/interaction';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';

import { createGameStore, turnView, type GameStore } from './gameStore';
import { BOT_ANSWER_NOTE_MS, GameScreen, type GameScreenProps } from './GameScreen';
import { openingStatus } from './opening';
import type { Seat } from './seats';
import { passNotice } from './turnNotices';

import { runOnFakeTimers } from '../../../test/clock';
import { touch } from '../../../test/gestureHandlerMock';
import { renderWithRoot } from '../../../test/render';

const SIZE = { width: 375, height: 520 };
const geo = fitBoardWithShadow(getLayout(getTheme('walnut-kafeneio'), 'portrait-rotated'), SIZE);
const PAN = 'game-board-pan';

const center = (r: { x: number; y: number; width: number; height: number }) => ({
  x: r.x + r.width / 2,
  y: r.y + r.height / 2,
});

type Game = 'plakoto' | 'fevga';

/** One game of `game` only (the presets keep the Tavli rotation). */
const rulesFor = (game: Game) => resolveRules(game, { match: { rotation: [game] } });

function newStore(game: Game, seed: number, targetPoints = 1): GameStore {
  return createGameStore({
    players: { white: 'Ann', black: 'Bob' },
    targetPoints,
    rules: rulesFor(game),
    rng: createSeededRng(seed),
  });
}

async function show(store: GameStore, props: Partial<GameScreenProps> = {}) {
  await renderWithRoot(<GameScreen store={store} {...props} />);
  await act(async () => {
    fireEvent(screen.getByTestId('game-board'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...SIZE } },
    });
  });
}

const press = async (testID: string) => {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
};

/** Sends an action to the store while the screen shows it. */
const send = async (store: GameStore, action: MatchAction) => {
  await act(async () => {
    expect(store.getState().dispatch(action)).toBe(true);
  });
};

// The game screen closes its cards on timers (see test/clock.ts).
runOnFakeTimers();

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

/**
 * Plays the match in the store to its end through the screen, as two
 * players would: roll, tap a checker, tap a target, confirm, close cards.
 * The mother question is answered "play on". Returns what it saw.
 */
async function playToTheEnd(store: GameStore) {
  let steps = 0;
  let questions = 0;
  let pins = 0;
  for (; steps < 4000; steps++) {
    const { flow } = store.getState();
    const view = turnView(flow);
    if (view.matchPhase !== 'playing') break;
    const card = (testID: string) => screen.queryByTestId(testID) !== null;
    if (view.phase === 'awaiting-answer') {
      questions++;
      await press('mother-play-on-button');
    } else if (passNotice(flow) && card('pass-ok-button')) await press('pass-ok-button');
    else if (view.phase === 'opening-roll') await press('roll-button');
    else if (openingStatus(view.game) && card('opening-overlay')) await press('opening-overlay');
    else if (view.phase === 'awaiting-roll') await press('roll-button');
    else if (view.phase === 'awaiting-confirm') await press('confirm-button');
    else {
      // Flip view: the player to move is at the bottom. The direction comes
      // from the game, like on the screen.
      const direction = view.game.state.rules.movement.direction;
      const boardView = { viewer: view.toMove, direction };
      const sources = buildSources(geo, view.board, boardView, view.toMove, view.legal);
      const source = sources[0]!;
      const target = source.targets[0]!;
      if (target.move.capture === 'pin') pins++;
      expect(target.move.capture).not.toBe('hit');
      await touch(PAN, [center(source.rect)]);
      await touch(PAN, [center(target.rect)]);
      expect(store.getState().flow.log.length).toBeGreaterThan(flow.log.length);
    }
  }
  return { steps, questions, pins };
}

describe('<GameScreen /> plays Plakoto and Fevga with taps only', () => {
  it('plays a whole Plakoto game: pins, the mother question and the end', async () => {
    const store = newStore('plakoto', 7);
    const onMatchOver = jest.fn();
    await show(store, { onMatchOver });
    const { steps, pins } = await playToTheEnd(store);
    const { flow } = store.getState();
    expect(flow.game.state.variant).toBe('plakoto');
    expect(flow.game.result).not.toBeNull();
    expect(flow.match.status).toBe('finished');
    // Nothing ever went to the bar.
    for (const event of flow.log) {
      if (event.type === 'move') expect(event.move.from).not.toBe('bar');
    }
    expect(pins).toBeGreaterThan(0);
    expect(steps).toBeLessThan(4000);
  }, 120_000);

  it('plays a whole Fevga game from the Fevga start', async () => {
    const store = newStore('fevga', 11);
    await show(store);
    // White starts on its own 24 (layout 24); Black on White's 12.
    const start = store.getState().flow.game.state.board;
    expect(start.points[23]).toMatchObject({ white: 15, black: 0 });
    expect(start.points[11]).toMatchObject({ white: 0, black: 15 });
    const { steps, questions } = await playToTheEnd(store);
    const { flow } = store.getState();
    expect(flow.game.state.variant).toBe('fevga');
    expect(flow.match.status).toBe('finished');
    expect(questions).toBe(0);
    expect(steps).toBeLessThan(4000);
  }, 120_000);

  it('Fevga: the first move can only be the runner, from the bottom-right corner', async () => {
    const store = newStore('fevga', 3);
    await show(store);
    // White opens with 6-1 and plays both dice.
    await send(store, { type: 'rollOpening', player: 'white', die: 6 });
    await send(store, { type: 'rollOpening', player: 'black', die: 1 });
    await press('opening-overlay');
    const view = turnView(store.getState().flow);
    expect(view.phase).toBe('moving');
    const boardView = { viewer: view.toMove, direction: 'parallel' as const };
    const sources = buildSources(geo, view.board, boardView, view.toMove, view.legal);
    expect(sources.map((s) => s.key)).toEqual(['p24']);
    // Tap the runner, then its first target: the move is played.
    const before = store.getState().flow.log.length;
    await touch(PAN, [center(sources[0]!.rect)]);
    await touch(PAN, [center(sources[0]!.targets[0]!.rect)]);
    expect(store.getState().flow.log.length).toBe(before + 1);
    expect(store.getState().flow.game.played).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The mother question.

/**
 * White is to roll 1-6 and can pin Black's mother: Black's last checker on
 * own 24 (= White 1) and a White checker on White 2. Black still has
 * checkers elsewhere, so the game goes on (offerConcede).
 */
const MOTHER_BOARD: BoardState = createBoard(
  {
    white: { points: { 24: 10, 14: 2, 8: 2, 2: 1 } },
    black: { points: { 24: 1, 20: 4, 16: 5, 12: 5 } },
  },
  'contrary',
);

function motherStore(players: PerPlayer<string> = { white: 'Ann', black: 'Bob' }): GameStore {
  const rules = rulesFor('plakoto');
  const store = createGameStore({ players, targetPoints: 3, rules, rng: createSeededRng(4) });
  const state = {
    ...plakoto.initialState({ startingPlayer: 'white', rules }),
    board: MOTHER_BOARD,
  };
  store.setState({
    flow: { ...store.getState().flow, game: createGameFlow({ state, starter: 'white' }) },
  });
  return store;
}

/** White pins Black's mother (2/1) and plays 24/18, through the screen. */
async function whitePinsTheMother(store: GameStore) {
  await send(store, { type: 'roll', player: 'white', dice: [1, 6] });
  await send(store, { type: 'move', player: 'white', move: { from: 2, to: 1, die: 1 } });
  await send(store, { type: 'move', player: 'white', move: { from: 24, to: 18, die: 6 } });
  await press('confirm-button');
}

describe('<GameScreen /> Plakoto mother question', () => {
  it('pass-and-play: asks the pinned player, with the board turned to them', async () => {
    const store = motherStore();
    await show(store);
    await whitePinsTheMother(store);

    expect(store.getState().flow.game.phase).toBe('awaiting-answer');
    const card = within(screen.getByTestId('mother-card'));
    expect(card.getByText('Bob, your mother is pinned')).toBeOnTheScreen();
    expect(card.getByText(/Ann pinned your last checker/)).toBeOnTheScreen();
    expect(card.getByText(/Ann wins 2 points/)).toBeOnTheScreen();
    // Flip: Bob, who must answer, is at the bottom. No Roll button yet.
    expect(within(screen.getByTestId('strip-bottom')).getByText('Bob')).toBeOnTheScreen();
    expect(screen.queryByTestId('roll-button')).toBeNull();
    // The screen reader hears the pin.
    expect(screen.getByLabelText(/Bob’s checker on point 24 is pinned/)).toBeOnTheScreen();

    await press('mother-play-on-button');
    expect(screen.queryByTestId('mother-card')).toBeNull();
    const { game } = store.getState().flow;
    expect(game.phase).toBe('awaiting-roll');
    expect(game.state.toMove).toBe('black');
    expect(screen.getByTestId('roll-button')).toBeOnTheScreen();
  });

  it('pass-and-play: "Resign" ends the game, 2 points to the pinner', async () => {
    const store = motherStore();
    await show(store);
    await whitePinsTheMother(store);
    await press('mother-resign-button');
    const { flow } = store.getState();
    expect(flow.game.result).toMatchObject({ winner: 'white', points: 2, reason: 'resigned' });
    expect(flow.match.score).toEqual({ white: 2, black: 0 });
    expect(screen.queryByTestId('mother-card')).toBeNull();
    expect(screen.getByTestId('game-end-card')).toBeOnTheScreen();
  });

  it('labels a board with no pinned checker plainly', async () => {
    const store = motherStore();
    await show(store);
    expect(screen.getByLabelText('Board')).toBeOnTheScreen();
  });
});

describe('<GameScreen /> Plakoto mother question vs the bot', () => {
  const seats: PerPlayer<Seat> = {
    white: { name: 'You', label: 'You', turnLabel: 'Your turn', you: true },
    black: { name: 'Bot', label: 'Bot · Easy', turnLabel: 'Playing', you: false },
  };
  /** The first legal turn of each roll. */
  const runner: BotRunner = {
    chooseMove: async (req) =>
      getVariant(VARIANT_REGISTRY, req.state.variant).legalTurns(req.state, req.dice)[0] as Turn,
    cancel: () => {},
  };
  const bot = {
    player: 'black' as const,
    difficulty: 'easy' as const,
    runner,
    rng: createSeededRng(1),
    timing: { beforeRollMs: 150, moveMs: 0, thinkMs: () => 0 },
  };

  it('the bot answers its own question ("play on") and plays its turn', async () => {
    const store = motherStore({ white: 'You', black: 'Bot' });
    await show(store, { seats, bot });
    await whitePinsTheMother(store);
    // No card for the person: the bot decides.
    expect(screen.queryByTestId('mother-card')).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId('bot-answer-note')).toHaveTextContent('Bot plays on.'),
    );
    await waitFor(() => expect(store.getState().flow.game.state.toMove).toBe('white'), {
      timeout: 3000,
    });
    const answers = store.getState().flow.log.filter((e) => e.type === 'answer');
    expect(answers).toEqual([{ type: 'answer', player: 'black', choice: 'playOn' }]);
    expect(screen.queryByTestId('bot-answer-note')).toBeNull();
  });

  it('hides "Bot plays on." after a short time, while the bot still thinks', async () => {
    const store = motherStore({ white: 'You', black: 'Bot' });
    const slow = { ...bot, timing: { ...bot.timing, thinkMs: () => BOT_ANSWER_NOTE_MS + 2000 } };
    await show(store, { seats, bot: slow });
    await whitePinsTheMother(store);
    await waitFor(() => expect(screen.getByTestId('bot-answer-note')).toBeOnTheScreen());
    await waitFor(() => expect(screen.queryByTestId('bot-answer-note')).toBeNull(), {
      timeout: BOT_ANSWER_NOTE_MS + 1000,
    });
    // Still the bot's turn: it has rolled and is thinking.
    expect(store.getState().flow.game.state.toMove).toBe('black');
    expect(store.getState().flow.game.phase).toBe('moving');
  }, 15_000);

  it('asks you when the bot pins your mother', async () => {
    // The same position with the colors swapped: Black (the bot) pins White.
    const store = motherStore({ white: 'You', black: 'Bot' });
    const rules = rulesFor('plakoto');
    const board = createBoard(
      {
        white: { points: { 24: 1, 20: 4, 16: 5, 12: 5 } },
        black: { points: { 24: 10, 14: 2, 8: 2, 2: 1 } },
      },
      'contrary',
    );
    const state = { ...plakoto.initialState({ startingPlayer: 'black', rules }), board };
    store.setState({
      flow: { ...store.getState().flow, game: createGameFlow({ state, starter: 'black' }) },
    });
    const pinner: BotRunner = {
      ...runner,
      chooseMove: async (req) => ({
        player: 'black',
        dice: req.dice,
        moves: [
          { from: 2, to: 1, die: 1, capture: 'pin' },
          { from: 24, to: 18, die: 6, capture: 'none' },
        ],
      }),
    };
    store.getState().dispatch({ type: 'roll', player: 'black', dice: [1, 6] });
    await show(store, { seats, bot: { ...bot, runner: pinner } });
    await waitFor(() => expect(screen.getByTestId('mother-card')).toBeOnTheScreen(), {
      timeout: 3000,
    });
    expect(screen.getByText('Your mother is pinned')).toBeOnTheScreen();
    expect(screen.getByLabelText(/Your checker on point 24 is pinned/)).toBeOnTheScreen();
    await press('mother-play-on-button');
    expect(store.getState().flow.game.phase).toBe('awaiting-roll');
    expect(store.getState().flow.game.state.toMove).toBe('white');
  });
});
