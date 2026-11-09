/**
 * Fast forward a race (`docs/rules/tavli-match.md`, "Fast forward a race").
 * Vs the bot, once no checker can touch an opponent checker again, a card
 * offers Fast forward on your roll (once per game, unless the setting is
 * off), and Roll comes with a Fast forward button. Then the bot plays both
 * sides fast to the end of the game, and Stop gives you the board back.
 *
 * The bot is a fake runner (the first legal turn) that records each
 * request, so the tests see which level played which side. Fake timers:
 * the bot waits on timers between steps.
 */
import { BotCancelledError, type BotMoveRequest, type BotRunner } from '@tavli/contracts';
import {
  VARIANT_REGISTRY,
  createBoard,
  createGameFlow,
  createSeededRng,
  getVariant,
  portes,
  type BoardState,
  type PerPlayer,
  type PlayerId,
  type Turn,
} from '@tavli/engine';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { FAST_FORWARD_TIMING } from '@/features/bot/botSpeed';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';

import { createGameStore, type GameStore } from './gameStore';
import { GameScreen, type BotSeat } from './GameScreen';
import type { Seat } from './seats';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { renderWithRoot } from '../../../test/render';

const SIZE = { width: 375, height: 500 };

const seats: PerPlayer<Seat> = {
  white: { name: 'You', label: 'You', turnLabel: 'Your turn', you: true },
  black: { name: 'Bot', label: 'Bot · Easy', turnLabel: 'Playing', you: false },
};

/** A fake runner: the first legal turn. Records each request. */
function fakeRunner() {
  const requests: BotMoveRequest[] = [];
  const runner: BotRunner & { requests: BotMoveRequest[] } = {
    requests,
    chooseMove: async (req) => {
      requests.push(req);
      const turns = getVariant(VARIANT_REGISTRY, req.state.variant).legalTurns(req.state, req.dice);
      return turns[0] as Turn;
    },
    cancel: () => {},
  };
  return runner;
}

function newStore(): GameStore {
  return createGameStore({
    players: { white: 'You', black: 'Bot' },
    targetPoints: 3,
    rng: createSeededRng(5),
  });
}

/** Puts the current game on `board`, with `player` to roll. */
function setPosition(store: GameStore, board: BoardState, player: PlayerId = 'white') {
  const { flow } = store.getState();
  const state = { ...portes.initialState({ startingPlayer: player }), board };
  store.setState({ flow: { ...flow, game: createGameFlow({ state, starter: player }) } });
}

// Every checker has passed: a race. Six checkers each are left in home.
const race = createBoard(
  {
    white: { points: { 3: 2, 2: 2, 1: 2 }, off: 9 },
    black: { points: { 3: 2, 2: 2, 1: 2 }, off: 9 },
  },
  'contrary',
);
// A long race: all 15 still to bear off on each side.
const longRace = createBoard(
  {
    white: { points: { 6: 5, 5: 5, 4: 5 } },
    black: { points: { 6: 5, 5: 5, 4: 5 } },
  },
  'contrary',
);
// White's last checker on 13 still faces Black's on its own 13 (White's 12): contact.
const contact = createBoard(
  {
    white: { points: { 13: 1, 6: 14 } },
    black: { points: { 13: 1, 6: 14 } },
  },
  'contrary',
);

interface Setup {
  readonly runner: ReturnType<typeof fakeRunner>;
  readonly autoEvents: number[];
  readonly bot: BotSeat;
}

function setup(withFastForward = true): Setup {
  const runner = fakeRunner();
  const autoEvents: number[] = [];
  const bot: BotSeat = {
    player: 'black',
    difficulty: 'easy',
    runner,
    rng: createSeededRng(1),
    timing: { beforeRollMs: 0, moveMs: 0, thinkMs: () => 0 },
    ...(withFastForward
      ? { fastForward: { difficulty: 'hard', onAutoEvent: (i: number) => autoEvents.push(i) } }
      : {}),
  };
  return { runner, autoEvents, bot };
}

async function show(store: GameStore, bot: BotSeat) {
  await renderWithRoot(<GameScreen store={store} seats={seats} bot={bot} openingTaps="one" />);
  await act(async () => {
    fireEvent(screen.getByTestId('game-board', { includeHiddenElements: true }), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, ...SIZE } },
    });
  });
}

/** The log indexes of White's actions (yours): rolls, answers, moves, undos, confirms. */
function yourEvents(log: readonly { readonly type: string; readonly player?: string }[]): number[] {
  return log.flatMap((e, i) => (e.type !== 'rollOpening' && e.player === 'white' ? [i] : []));
}

/** Moves the fake clock. The bot's steps chain timers through promises, so it runs them as they come. */
const tick = async (ms: number) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};

const button = (name: RegExp | string) => screen.getByRole('button', { name });

let announce: jest.SpyInstance;

runOnFakeTimers();

beforeEach(async () => {
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

afterEach(() => {
  announce.mockRestore();
});

describe('<GameScreen /> fast forward a race', () => {
  it('opens a race with a card, on your roll only', async () => {
    const store = newStore();
    setPosition(store, contact);
    const { bot } = setup();
    await show(store, bot);
    expect(screen.getByTestId('roll-button')).toBeOnTheScreen();
    expect(screen.queryByTestId('race-card')).toBeNull();
    expect(screen.queryByTestId('fast-forward-button')).toBeNull();

    // Not on the bot's turn.
    await act(async () => {
      setPosition(store, race, 'black');
    });
    expect(screen.queryByTestId('race-card')).toBeNull();
    expect(screen.queryByTestId('fast-forward-button')).toBeNull();

    await act(async () => {
      setPosition(store, race);
    });
    expect(screen.getByTestId('race-card')).toBeOnTheScreen();
    expect(screen.getByText("It's a race")).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith(expect.stringContaining("It's a race"));
    // The card answers first: no Roll, no swipe, and the board is hidden from screen readers.
    expect(screen.queryByTestId('roll-button')).toBeNull();
    expect(screen.queryByTestId('fast-forward-button')).toBeNull();
    expect(screen.queryByTestId('game-board')).toBeNull();
    expect(
      button('Fast forward: the bot plays both sides to the end of the game'),
    ).toBeOnTheScreen();
  });

  it('Play on: Fast forward stays next to Roll, and the card does not come back', async () => {
    const user = setupUser();
    const store = newStore();
    setPosition(store, longRace);
    const { bot, runner } = setup();
    await show(store, bot);
    await user.press(screen.getByTestId('race-play-on-button'));
    expect(screen.queryByTestId('race-card')).toBeNull();
    expect(screen.getByTestId('roll-button')).toBeOnTheScreen();
    expect(screen.getByTestId('fast-forward-button')).toBeOnTheScreen();
    expect(runner.requests).toHaveLength(0);
    expect(settingsStore.getState().offerFastForward).toBe(true);

    // A new screen for the same game (Home, then Continue): still answered.
    await screen.unmount();
    await show(store, bot);
    expect(screen.queryByTestId('race-card')).toBeNull();
    expect(screen.getByTestId('fast-forward-button')).toBeOnTheScreen();

    // The button still starts it.
    await user.press(screen.getByTestId('fast-forward-button'));
    expect(screen.getByTestId('fast-forward-status')).toHaveTextContent('Fast forward…');
  });

  it("Don't ask again turns the setting off; the button stays", async () => {
    const user = setupUser();
    const store = newStore();
    setPosition(store, longRace);
    const { bot } = setup();
    await show(store, bot);
    await user.press(screen.getByTestId('race-never-button'));
    expect(settingsStore.getState().offerFastForward).toBe(false);
    expect(screen.queryByTestId('race-card')).toBeNull();
    expect(screen.getByTestId('roll-button')).toBeOnTheScreen();
    expect(screen.getByTestId('fast-forward-button')).toBeOnTheScreen();
    expect(screen.queryByTestId('fast-forward-status')).toBeNull();
  });

  it('with the setting off: no card, only the button next to Roll', async () => {
    await act(async () => {
      settingsStore.setState({ offerFastForward: false });
    });
    const store = newStore();
    setPosition(store, race);
    const { bot } = setup();
    await show(store, bot);
    expect(screen.queryByTestId('race-card')).toBeNull();
    expect(screen.getByTestId('roll-button')).toBeOnTheScreen();
    expect(
      button('Fast forward: the bot plays both sides to the end of the game'),
    ).toBeOnTheScreen();
  });

  it('has no Fast forward without the seat for it', async () => {
    const store = newStore();
    setPosition(store, race);
    await show(store, setup(false).bot);
    expect(screen.getByTestId('roll-button')).toBeOnTheScreen();
    expect(screen.queryByTestId('fast-forward-button')).toBeNull();
  });

  it('plays both sides to the end of the game, your side at the fast forward level', async () => {
    const user = setupUser();
    const store = newStore();
    setPosition(store, longRace);
    const { bot, runner, autoEvents } = setup();
    await show(store, bot);

    await user.press(screen.getByTestId('race-fast-forward-button'));
    expect(screen.getByTestId('fast-forward-status')).toHaveTextContent('Fast forward…');
    expect(button('Stop fast forward and play on yourself')).toBeOnTheScreen();
    expect(screen.queryByTestId('roll-button')).toBeNull();
    expect(announce).toHaveBeenCalledWith(
      'Fast forward. The bot plays both sides to the end of the game.',
    );

    await waitFor(() => expect(screen.getByTestId('game-end-card')).toBeOnTheScreen(), {
      timeout: 120_000,
    });
    const flow = store.getState().flow;
    expect(flow.game.result?.reason).toBe('borneOff');
    expect(flow.match.score.white + flow.match.score.black).toBe(flow.game.result?.points);

    // Your side played at the fast forward level; the bot's at its own.
    const levels = new Set(runner.requests.map((r) => `${r.state.toMove}:${r.difficulty}`));
    expect(levels).toEqual(new Set(['white:hard', 'black:easy']));
    // Every action for you is marked for the review, and only those.
    const yours = yourEvents(flow.log);
    expect(yours.filter((i) => flow.log[i]?.type === 'roll').length).toBeGreaterThan(1);
    expect(yours.some((i) => flow.log[i]?.type === 'move')).toBe(true);
    expect(autoEvents).toEqual(yours);
    // The game is over: no status, no Stop.
    expect(screen.queryByTestId('fast-forward-status', { includeHiddenElements: true })).toBeNull();
  });

  it('plays a turn in about a second', async () => {
    const user = setupUser();
    const store = newStore();
    setPosition(store, longRace);
    const { bot } = setup();
    await show(store, bot);
    await user.press(screen.getByTestId('race-fast-forward-button'));
    const { beforeRollMs, afterRollMs, moveMs, landMs } = FAST_FORWARD_TIMING;
    // Your roll comes after the short wait, and it is not thrown over the board.
    await tick(beforeRollMs);
    expect(store.getState().flow.game.phase).toBe('moving');
    // Two moves (four for a double), then the confirm.
    await tick(afterRollMs + 3 * moveMs + landMs + 50);
    expect(store.getState().flow.game.state.toMove).toBe('black');
  });

  it('Stop on the bot turn: the bot ends it, and your next roll waits for you', async () => {
    const user = setupUser();
    const store = newStore();
    setPosition(store, longRace);
    const { bot, autoEvents } = setup();
    await show(store, bot);
    await user.press(screen.getByTestId('race-fast-forward-button'));
    // Your fast turn, then the bot's roll.
    await waitFor(
      () => {
        const game = store.getState().flow.game;
        expect(game.phase === 'moving' && game.state.toMove === 'black').toBe(true);
      },
      { timeout: 30_000 },
    );
    // Your roll, moves and confirm.
    const marked = autoEvents.length;
    expect(autoEvents).toEqual(yourEvents(store.getState().flow.log));
    expect(marked).toBeGreaterThan(2);

    await user.press(screen.getByTestId('fast-forward-stop-button'));
    expect(screen.queryByTestId('fast-forward-status')).toBeNull();
    // The bot ends its own turn, at its own speed.
    await waitFor(
      () => {
        const game = store.getState().flow.game;
        expect(game.phase === 'awaiting-roll' && game.state.toMove === 'white').toBe(true);
      },
      { timeout: 30_000 },
    );
    await tick(30_000);
    expect(store.getState().flow.game.state.toMove).toBe('white');
    expect(store.getState().flow.game.phase).toBe('awaiting-roll');
    expect(autoEvents.length).toBe(marked);
    expect(screen.getByTestId('roll-button')).toBeOnTheScreen();
    expect(screen.getByTestId('fast-forward-button')).toBeOnTheScreen();
  });

  it('Stop on your turn: the rest of that turn is yours to play', async () => {
    const user = setupUser();
    const store = newStore();
    setPosition(store, longRace);
    const { bot, runner, autoEvents } = setup();
    await show(store, bot);
    await user.press(screen.getByTestId('race-fast-forward-button'));
    await tick(FAST_FORWARD_TIMING.beforeRollMs);
    expect(store.getState().flow.game.phase).toBe('moving');
    await user.press(screen.getByTestId('fast-forward-stop-button'));
    // Only the roll is marked: the moves are yours, so the review grades them.
    const log = store.getState().flow.log;
    expect(autoEvents).toEqual([log.length - 1]);
    expect(log[log.length - 1]?.type).toBe('roll');
    const asked = runner.requests.length;
    await tick(30_000);
    const game = store.getState().flow.game;
    expect(game.state.toMove).toBe('white');
    expect(['moving', 'awaiting-confirm']).toContain(game.phase);
    expect(runner.requests.length).toBe(asked);
    expect(screen.getByTestId('confirm-button')).toBeOnTheScreen();
    expect(screen.getByTestId('undo-button')).toBeOnTheScreen();
  });

  it('pauses while the menu is open and goes on after it', async () => {
    const user = setupUser();
    const store = newStore();
    setPosition(store, longRace);
    const { bot } = setup();
    await show(store, bot);
    await user.press(screen.getByTestId('race-fast-forward-button'));
    await screen.rerender(
      <GameScreen store={store} seats={seats} bot={bot} openingTaps="one" paused />,
    );
    const logLength = store.getState().flow.log.length;
    await tick(30_000);
    expect(store.getState().flow.log.length).toBe(logLength);

    await screen.rerender(<GameScreen store={store} seats={seats} bot={bot} openingTaps="one" />);
    await waitFor(() => expect(screen.getByTestId('game-end-card')).toBeOnTheScreen(), {
      timeout: 120_000,
    });
  });

  it('ends with the game: the next game starts without it', async () => {
    const user = setupUser();
    const store = newStore();
    setPosition(store, race);
    const { bot } = setup();
    await show(store, bot);
    await user.press(screen.getByTestId('race-fast-forward-button'));
    await waitFor(() => expect(screen.getByTestId('game-end-card')).toBeOnTheScreen(), {
      timeout: 60_000,
    });
    await user.press(screen.getByTestId('next-game-button'));
    // The next game starts with its own play: no fast forward running.
    expect(screen.queryByTestId('fast-forward-status')).toBeNull();
  });

  it('a bot error stops the turn, not the screen', async () => {
    const user = setupUser();
    const store = newStore();
    setPosition(store, longRace);
    const { bot } = setup();
    const failing: BotSeat = {
      ...bot,
      runner: {
        chooseMove: () => Promise.reject(new BotCancelledError()),
        cancel: () => {},
      },
    };
    await show(store, failing);
    await user.press(screen.getByTestId('race-fast-forward-button'));
    await tick(5000);
    // The roll is in, the runner gave no turn: Stop still gives the board back.
    expect(store.getState().flow.game.phase).toBe('moving');
    await user.press(screen.getByTestId('fast-forward-stop-button'));
    expect(screen.getByTestId('confirm-button')).toBeOnTheScreen();
  });
});
