import {
  type createRecordingFeedback,
  type createRecordingSoundPlayer,
  type GameTransport,
  type OnlineGameChoice,
  type Safety,
} from '@tavli/contracts';
import { applyMatchAction, createSeededRng, type MatchFlow } from '@tavli/engine';
import { createMemoryGameServer, type MemoryGameServer } from '@tavli/online';
import { closedOut, guestNumberOf, lastBearOff } from '@tavli/online/testing';
import { getLayout, getTheme } from '@tavli/themes';
import { themes } from '@tavli/ui';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { REMOTE_FLIGHT_MS, turnMoveDelay } from '@/features/board/flights';
import type { BoardThrowProps as MockBoardThrowProps } from '@/features/dice-throw/BoardThrow';
import { buildSources } from '@/features/board/interaction';
import { fitBoardWithShadow, slotRect } from '@/features/board/geometry';
import {
  BOT_PASS_NOTICE_MS,
  ONLINE_PASS_DICE_MS,
  OPENING_TIE_WAIT_MS,
  PASS_AFTER_THROW_MS,
} from '@/features/game/GameScreen';
import { turnView } from '@/features/game/gameStore';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import { botRunner, feedback, sound } from '@/services';

import { ONLINE_BOT_ROLL_MS, startOnlineBot, type OnlineBot } from './onlineBot';
import { OnlineMatchScreen } from './OnlineMatchScreen';
import { viewFlow } from './onlineStore';

import { center } from '../../../test/boardPlay';
import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { touch } from '../../../test/gestureHandlerMock';
import { renderWithRoot } from '../../../test/render';
import { countNodes, findAllNodes, type JsonNode } from '../../../test/tree';

const SIZE = { width: 375, height: 500 };
const geo = fitBoardWithShadow(getLayout(getTheme('walnut-kafeneio'), 'portrait-rotated'), SIZE);
const PAN = 'game-board-pan';
/** The bot thinks this long before its whole turn arrives. */
const BOT_THINK_MS = 2000;
const haptics = feedback as ReturnType<typeof createRecordingFeedback>;
const sounds = sound as ReturnType<typeof createRecordingSoundPlayer>;
const MOVE_SOUNDS: readonly string[] = ['checkerPlace', 'checkerHit', 'bearOff'];
const moveSounds = () => sounds.played.filter((s) => MOVE_SOUNDS.includes(s));

// Records each dice throw over the board (one per mount), then plays the
// real one: its wall and its dice (#373).
const mockThrows: { wall: string | undefined; values: readonly number[] }[] = [];
jest.mock('@/features/dice-throw/BoardThrow', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const actual = jest.requireActual<typeof import('@/features/dice-throw/BoardThrow')>(
    '@/features/dice-throw/BoardThrow',
  );
  return {
    ...actual,
    BoardThrow: (props: MockBoardThrowProps) => {
      React.useState(() => mockThrows.push({ wall: props.wall, values: props.values }));
      return React.createElement(actual.BoardThrow, props);
    },
  };
});

runOnFakeTimers();

beforeEach(() => {
  mockThrows.length = 0;
});

let bot: OnlineBot | null = null;
afterEach(() => {
  bot?.stop();
  bot = null;
});

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
  });
});

interface Game {
  readonly server: MemoryGameServer;
  readonly gameId: string;
  readonly onMatchOver: jest.Mock;
}

/** A game of `me` (White) vs the bot (Black) on its own in-memory server, on the screen. */
async function openGame(
  choice: OnlineGameChoice = 'portes',
  turnTimeMinutes: number | null = 1,
  targetPoints = 5,
  botThinkMs = BOT_THINK_MS,
  meTransport: (server: MemoryGameServer) => GameTransport = (server) => server.transportFor('me'),
  /** Changes the game before anyone watches it (`setFlowForTest`). */
  prepare?: (server: MemoryGameServer, gameId: string) => void,
  /** Rolls your opening die on the screen and waits for the card to close (#379). */
  playOpening = true,
  /** The `Safety` port for the menu's Report or block (#435). None: no such row. */
  safetyOf?: (server: MemoryGameServer) => Safety,
  /** A Play ranked game (#529): two time outs in a row lose the match. */
  options: { readonly ranked?: boolean } = {},
): Promise<Game> {
  const server = createMemoryGameServer({ rng: createSeededRng(21), now: () => Date.now() });
  const gameId = server.createGame(
    'me',
    { white: 'me', black: 'bot' },
    choice,
    targetPoints,
    turnTimeMinutes,
    options,
  );
  prepare?.(server, gameId);
  bot = startOnlineBot({
    transport: server.transportFor('bot'),
    gameId,
    botId: 'bot',
    difficulty: 'easy',
    runner: botRunner,
    rng: createSeededRng(3),
    timing: { thinkMs: () => botThinkMs },
  });
  const onMatchOver = jest.fn();
  await renderWithRoot(
    <OnlineMatchScreen
      gameId={gameId}
      transport={meTransport(server)}
      me="me"
      onExit={jest.fn()}
      onSettings={jest.fn()}
      onRules={jest.fn()}
      onMatchOver={onMatchOver}
      {...(safetyOf ? { safety: safetyOf(server) } : {})}
    />,
  );
  const board = await screen.findByTestId('game-board', { includeHiddenElements: true });
  await act(async () => {
    fireEvent(board, 'layout', { nativeEvent: { layout: { x: 0, y: 0, ...SIZE } } });
  });
  const game = { server, gameId, onMatchOver };
  if (playOpening) await untilOpened(game);
  return game;
}

const view = (game: Game) => game.server.getGame(game.gameId)!;
/** The bot's guest name (#400): the screen names the other player by it. */
const botName = (game: Game) => `Guest ${guestNumberOf(game.server, 'bot')}`;

/**
 * Moves the clock until the server waits for you, and the screen has that
 * view. Your turn waits for your roll (#355): with `roll` (the default) it
 * taps Roll, and the server rolls, so the turn can be played; a roll with
 * no legal move passes, and it goes on. Without `roll` it stops at the
 * Roll button. The other player's pass card closes by itself first.
 */
async function untilYourTurn(game: Game, { roll = true }: { roll?: boolean } = {}) {
  for (let i = 0; i < 400; i++) {
    const now = view(game);
    if (
      now.waitingFor === 'white' &&
      screen.queryByTestId('online-wait') === null &&
      screen.queryByTestId('pass-card') === null
    ) {
      if (now.game.phase !== 'awaiting-roll') return;
      const button = screen.queryByTestId('roll-button');
      if (button !== null) {
        if (!roll) return;
        await act(async () => {
          fireEvent.press(button);
        });
        continue;
      }
    }
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
  }
  throw new Error('your turn never came');
}

/**
 * Plays the opening of a new match (#379): taps Roll on the opening card
 * for your die (again after a tie), while the bot rolls its own, and moves
 * the clock until the card closes.
 */
async function untilOpened(game: Game) {
  for (let i = 0; i < 400; i++) {
    const card = screen.queryByTestId('opening-card');
    if (card === null && view(game).game.phase !== 'opening-roll') return;
    const button = screen.queryByTestId('roll-button');
    if (card !== null && button !== null && view(game).game.opening?.white === null) {
      await act(async () => {
        fireEvent.press(button);
      });
    }
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
  }
  throw new Error('the opening never ended');
}

/** Moves the fake clock by `ms`. */
async function wait(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/**
 * Plays your whole turn by tap-tap on the board (the first legal target
 * each time). `gapMs` moves the clock after each move, as a person takes
 * time between taps (the feedback skips a sound that comes too soon).
 */
async function playTurnByTaps(game: Game, gapMs = 0) {
  let flow: MatchFlow = viewFlow(view(game));
  while (flow.game.phase === 'moving') {
    const now = turnView(flow);
    const boardView = {
      viewer: 'white' as const,
      direction: now.game.state.rules.movement.direction,
    };
    const [source] = buildSources(geo, now.board, boardView, 'white', now.legal);
    const target = source!.targets[0]!;
    await touch(PAN, [{ x: source!.checker.x, y: source!.checker.y }]);
    await touch(PAN, [center(target.rect)]);
    flow = applyMatchAction(flow, { type: 'move', player: 'white', move: target.move });
    if (gapMs > 0) await wait(gapMs);
  }
}

describe('<OnlineMatchScreen /> (#255)', () => {
  it('plays your turn by taps, then shows the bot’s answer', async () => {
    const user = setupUser();
    const game = await openGame();
    await untilYourTurn(game);
    expect(screen.queryByTestId('roll-button')).toBeNull();
    const before = view(game).version;
    await playTurnByTaps(game);
    await user.press(screen.getByTestId('confirm-button'));
    // The server has your turn; the bot thinks.
    expect(view(game).version).toBeGreaterThan(before);
    expect(view(game).game.lastTurn?.player).toBe('white');
    expect(screen.getByTestId('online-wait')).toHaveTextContent(`Waiting for ${botName(game)}…`);

    // The bot's whole turn arrives, and it is your turn again.
    await untilYourTurn(game);
    const last = view(game).game.lastTurn;
    expect(last?.player).toBe('black');
    expect(screen.getByTestId('confirm-button')).toBeOnTheScreen();
    expect(screen.getByTestId('strip-bottom')).toHaveTextContent(/your turn/i);
  });

  it('plays the bot’s roll and moves, and your own turn once (#271)', async () => {
    const user = setupUser();
    const game = await openGame();
    await untilYourTurn(game);
    // The flights and the dice of the bot's turn are done.
    await wait(2000);
    sounds.played.length = 0;
    await playTurnByTaps(game, 500);
    await user.press(screen.getByTestId('confirm-button'));
    const mine = view(game).game.lastTurn;
    expect(mine?.player).toBe('white');
    // Your moves sounded on the phone; the view of your turn adds none,
    // and no roll: the bot rolls on its own (#355).
    expect(moveSounds()).toHaveLength(mine?.moves.length ?? -1);
    expect(sounds.played).not.toContain('diceRoll');
    // The bot's roll arrives: its dice tumble, with their sound.
    await wait(ONLINE_BOT_ROLL_MS);
    expect(sounds.played.filter((s) => s === 'diceRoll')).toHaveLength(1);

    await wait(1000);
    sounds.played.length = 0;
    haptics.calls.length = 0;
    await untilYourTurn(game);
    await wait(2000);
    const last = view(game).game.lastTurn;
    expect(last?.player).toBe('black');
    // One sound per move of the bot, as they fly, then your roll.
    expect(moveSounds()).toHaveLength(last?.moves.length ?? -1);
    expect(sounds.played).toContain('diceRoll');
    expect(sounds.played).not.toContain('invalidMove');
    expect(haptics.calls.length).toBeGreaterThan(0);
  });

  it('plays nothing for the bot’s turn with Sound and Haptics off (#271)', async () => {
    await act(async () => {
      settingsStore.getState().setSetting('sound', false);
      settingsStore.getState().setSetting('haptics', false);
    });
    const user = setupUser();
    const game = await openGame();
    await untilYourTurn(game);
    await playTurnByTaps(game);
    await user.press(screen.getByTestId('confirm-button'));
    sounds.played.length = 0;
    haptics.calls.length = 0;
    await untilYourTurn(game);
    await wait(2000);
    expect(view(game).game.lastTurn?.player).toBe('black');
    expect(sounds.played).toEqual([]);
    expect(haptics.calls).toEqual([]);
  });

  it('plays the win jingle when the bot’s time runs out (#271)', async () => {
    const user = setupUser();
    // The bot thinks longer than its turn time.
    const game = await openGame('portes', 1, 5, 60_000 * 2);
    if (view(game).waitingFor === 'white') {
      await untilYourTurn(game);
      await playTurnByTaps(game);
      await user.press(screen.getByTestId('confirm-button'));
    }
    expect(view(game).waitingFor).toBe('black');
    await wait(2000);
    sounds.played.length = 0;
    haptics.calls.length = 0;
    await act(async () => {
      jest.advanceTimersByTime(60_000 + 1000);
      game.server.runDueTimeouts();
    });
    expect(view(game).match.games).toEqual([
      expect.objectContaining({ winner: 'white', reason: 'timeout' }),
    ]);
    expect(await screen.findByTestId('game-end-card')).toHaveTextContent(/You win the game/);
    // The win jingle, as in a local game. The next game waits for the
    // sheet to close (#286): no roll sound, no dice.
    expect(sounds.played).toEqual(['gameWin']);
    expect(haptics.calls.filter((h) => h !== 'light')).toEqual(['success']);
  });

  describe('between games (#286)', () => {
    /** The bot is too slow: its time runs out and you win game 1. The sheet opens. */
    async function winGameOne(
      user: ReturnType<typeof setupUser>,
      choice: OnlineGameChoice = 'portes',
      targetPoints = 5,
    ) {
      // The classic layout shows the game label ("Game 1 · Portes").
      await act(async () => {
        settingsStore.getState().setSetting('boardLayout', 'classic');
      });
      const game = await openGame(choice, 1, targetPoints, 60_000 * 2);
      if (view(game).waitingFor === 'white') {
        await untilYourTurn(game);
        await playTurnByTaps(game);
        await user.press(screen.getByTestId('confirm-button'));
      }
      expect(view(game).waitingFor).toBe('black');
      await wait(2000);
      await act(async () => {
        jest.advanceTimersByTime(60_000 + 1000);
        game.server.runDueTimeouts();
      });
      expect(await screen.findByTestId('game-end-card')).toHaveTextContent(/You win the game/);
      return game;
    }

    const gameLabel = () => screen.getByTestId('game-label', { includeHiddenElements: true });

    it('holds the next game’s dice and sounds until the sheet closes, then plays its roll once', async () => {
      const announce = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => {});
      const user = setupUser();
      const game = await winGameOne(user);
      // The server has started game 2. You won game 1, so you start it, and
      // it waits for your roll (#355).
      expect(view(game).match.games).toHaveLength(1);
      expect(view(game).waitingFor).toBe('white');
      expect(view(game).game.phase).toBe('awaiting-roll');
      expect(view(game).game.state.dice).toBeNull();

      // Under the sheet the board keeps the end of game 1: no dice, no
      // roll sound, nothing of game 2 read, however long the sheet stays.
      sounds.played.length = 0;
      announce.mockClear();
      await wait(5000);
      expect(screen.queryByTestId('board-dice')).toBeNull();
      expect(screen.queryByTestId('confirm-button')).toBeNull();
      expect(gameLabel()).toHaveTextContent('Game 1 · Portes');
      expect(sounds.played).toEqual([]);
      expect(announce).not.toHaveBeenCalled();
      expect(screen.getByTestId('game-end-card')).toHaveTextContent(/Next: game 2 · Portes/);
      // The new score, as after a local game.
      const { score } = view(game).match;
      expect(score.white).toBeGreaterThan(0);
      expect(screen.getByTestId('game-end-card')).toHaveTextContent(
        new RegExp(`You ${score.white} – 0 ${botName(game)}`),
      );

      // The sheet closes: game 2 shows. "Your turn.", no dice yet.
      await user.press(screen.getByTestId('next-game-button'));
      expect(screen.queryByTestId('game-end-card')).toBeNull();
      expect(gameLabel()).toHaveTextContent('Game 2 · Portes');
      expect(view(game).waitingFor).toBe('white');
      expect(screen.queryByTestId('board-dice')).toBeNull();
      expect(announce.mock.calls.map(([text]) => text)).toEqual(['Your turn.']);
      // Roll: the server rolls, its dice tumble and sound once, and the roll
      // is read once.
      await user.press(screen.getByTestId('roll-button'));
      expect(screen.getByTestId('board-dice')).toBeOnTheScreen();
      await wait(3000);
      expect(sounds.played.filter((s) => s === 'diceRoll')).toEqual(['diceRoll']);
      expect(sounds.played).not.toContain('gameWin');
      const dice = view(game).game.state.dice!;
      expect(announce).toHaveBeenCalledTimes(2);
      expect(String(announce.mock.calls[1]?.[0])).toMatch(
        dice[0] === dice[1] ? /You rolled double/ : `You rolled ${dice.join('-')}.`,
      );
      announce.mockRestore();
    });

    it('flies the bot’s winning turn to the end position before the sheet opens (#299)', async () => {
      const game = await openGame('portes', 1, 5, BOT_THINK_MS, undefined, (server, id) => {
        // The bot (Black) bears off its last two checkers with its next turn.
        server.setFlowForTest(id, lastBearOff(viewFlow(server.getGame(id)!), 'black'));
      });
      expect(view(game).waitingFor).toBe('black');
      sounds.played.length = 0;
      // The bot thinks, then its whole turn arrives.
      for (let i = 0; i < 100 && view(game).match.games.length === 0; i++) await wait(50);
      // Its two checkers fly off one after the other. The sheet waits until
      // the last one lands, so it never covers them.
      const landed = turnMoveDelay(1) + REMOTE_FLIGHT_MS;
      await wait(landed - 1);
      expect(screen.queryByTestId('game-end-card')).toBeNull();
      expect(screen.queryByTestId('next-game-button')).toBeNull();
      await wait(1);
      expect(screen.getByTestId('game-end-card')).toHaveTextContent(
        new RegExp(`${botName(game)} wins the game`),
      );
      await wait(2000);
      // The server has game 2; its view keeps the bot's winning turn.
      expect(view(game).match.games).toEqual([
        expect.objectContaining({ winner: 'black', reason: 'borneOff' }),
      ]);
      const winning = view(game).previousGame?.lastTurn;
      expect(winning?.player).toBe('black');
      expect(winning?.moves.map((move) => move.to)).toEqual(['off', 'off']);
      // Its checkers flew off one by one, with their sounds, as any turn of the bot.
      expect(moveSounds()).toEqual(['bearOff', 'bearOff']);
      expect(sounds.played).not.toContain('gameWin');
      expect(screen.queryByTestId('board-dice')).toBeNull();
    });

    it('keeps the turn timer of the next game running under the sheet', async () => {
      const user = setupUser();
      const game = await winGameOne(user);
      expect(view(game).turnDeadline).not.toBeNull();
      // The time left of game 2 shows on the strip of the player it waits
      // for: you won game 1, so you start game 2.
      expect(view(game).waitingFor).toBe('white');
      expect(
        screen.getByTestId('strip-bottom-time', { includeHiddenElements: true }),
      ).toHaveTextContent(/^\d:\d\d$/);

      // Nobody plays game 2 while the sheet is open: the server ends it.
      sounds.played.length = 0;
      await act(async () => {
        jest.advanceTimersByTime(60_000 + 1000);
        game.server.runDueTimeouts();
      });
      expect(view(game).match.games).toHaveLength(2);
      expect(view(game).match.games[1]).toEqual(
        expect.objectContaining({ winner: 'black', reason: 'timeout' }),
      );
      // Your time ran out in game 2: its card replaces the sheet (#530);
      // still no dice under it.
      expect(await screen.findByTestId('time-ran-out-card')).toHaveTextContent(
        new RegExp(`${botName(game)} wins this game`),
      );
      expect(screen.queryByTestId('game-end-card')).toBeNull();
      expect(screen.queryByTestId('board-dice')).toBeNull();
      expect(sounds.played.filter((s) => s === 'diceRoll' || s === 'diceLand')).toEqual([]);

      await user.press(screen.getByTestId('time-ran-out-button'));
      expect(screen.queryByTestId('time-ran-out-card')).toBeNull();
      // Game 3 waits for the bot's roll (#355); its dice tumble once it rolls.
      await wait(ONLINE_BOT_ROLL_MS);
      expect(screen.getByTestId('board-dice')).toBeOnTheScreen();
      await wait(3000);
      expect(sounds.played.filter((s) => s === 'diceRoll')).toEqual(['diceRoll']);
    });

    it('names game 2 of a Tavli match when it ends under the sheet', async () => {
      const user = setupUser();
      const game = await winGameOne(user, 'tavli', 15);
      expect(gameLabel()).toHaveTextContent('Game 1 · Portes');
      expect(screen.getByTestId('game-end-card')).toHaveTextContent(/Next: game 2 · Plakoto/);
      // Nobody plays game 2 (Plakoto) while the sheet is open.
      await act(async () => {
        jest.advanceTimersByTime(60_000 + 1000);
        game.server.runDueTimeouts();
      });
      expect(view(game).match.games).toHaveLength(2);
      // It was your turn (you won game 1): the "Time ran out" card shows over game 2 (#530).
      expect(await screen.findByTestId('time-ran-out-card')).toBeOnTheScreen();
      expect(gameLabel()).toHaveTextContent('Game 2 · Plakoto');
    });
  });

  describe('the opening roll on tap (#379)', () => {
    /** A transport for `me` whose roll fails while `offline()` says so. */
    const flaky =
      (offline: () => boolean) =>
      (server: MemoryGameServer): GameTransport => {
        const real = server.transportFor('me');
        return {
          subscribe: (id, onView, onError) => real.subscribe(id, onView, onError),
          rollDice: (request) =>
            offline() ? Promise.reject(new Error('offline')) : real.rollDice(request),
          sendTurn: (request) => real.sendTurn(request),
          setDraft: (request) => real.setDraft(request),
          sendAnswer: (request) => real.sendAnswer(request),
          resign: (id) => real.resign(id),
          listMyGames: (request) => real.listMyGames(request),
          watchMyGames: (request, onList, onError) => real.watchMyGames(request, onList, onError),
        };
      };

    it('rolls your die from the opening card, and the bot rolls its own', async () => {
      const user = setupUser();
      const game = await openGame('portes', 1, 5, BOT_THINK_MS, undefined, undefined, false);
      expect(view(game).game.phase).toBe('opening-roll');
      expect(view(game).game.opening).toMatchObject({ white: null, black: null });
      expect(screen.getByTestId('opening-card')).toBeOnTheScreen();
      sounds.played.length = 0;

      await user.press(screen.getByTestId('roll-button'));
      const white = view(game).game.opening!.white!;
      expect(white).not.toBeNull();
      // Your die plays as a local opening roll; the card waits for the bot.
      expect(sounds.played).toContain('diceRoll');
      expect(screen.getByTestId('opening-message')).toHaveTextContent(`You rolled ${white}.`);
      expect(screen.queryByTestId('roll-button')).toBeNull();
      expect(screen.getByTestId('opening-waiting')).toHaveTextContent(
        `Waiting for ${botName(game)}…`,
      );

      // The bot taps its die after a moment; its die comes with the view.
      await wait(ONLINE_BOT_ROLL_MS);
      const after = view(game);
      expect(after.game.phase).not.toBe('opening-roll');
      expect(after.game.opening?.black).not.toBeNull();
      expect(screen.getByTestId('opening-ok-button')).toBeOnTheScreen();
      // The card closes by itself, and the starter plays.
      await wait(3000);
      expect(screen.queryByTestId('opening-card')).toBeNull();
    });

    it('shows a tie on the card, and Roll comes back after a moment', async () => {
      const game = await openGame(
        'portes',
        1,
        5,
        BOT_THINK_MS,
        undefined,
        (server, id) => {
          let flow = viewFlow(server.getGame(id)!);
          flow = applyMatchAction(flow, { type: 'rollOpening', player: 'white', die: 4 });
          flow = applyMatchAction(flow, { type: 'rollOpening', player: 'black', die: 4 });
          server.setFlowForTest(id, flow);
        },
        false,
      );
      expect(view(game).game.opening).toMatchObject({ white: null, black: null, ties: [4] });
      expect(screen.getByTestId('opening-message')).toHaveTextContent(/^Tie: both rolled 4\./);
      // The dice land first: Roll waits.
      expect(screen.getByTestId('roll-button')).toBeDisabled();
      await wait(OPENING_TIE_WAIT_MS);
      expect(screen.getByTestId('roll-button')).toBeEnabled();
      await act(async () => {
        fireEvent.press(screen.getByTestId('roll-button'));
      });
      expect(view(game).game.opening?.white ?? view(game).game.opening?.ties.length).toBeTruthy();
    });

    it('says when your die does not reach the server, and lets you roll again', async () => {
      const user = setupUser();
      let offline = true;
      const game = await openGame(
        'portes',
        1,
        5,
        BOT_THINK_MS,
        flaky(() => offline),
        undefined,
        false,
      );
      const version = view(game).version;
      await user.press(screen.getByTestId('roll-button'));
      expect(await screen.findByTestId('online-notice-card')).toHaveTextContent(
        /did not reach the server/,
      );
      expect(view(game).game.opening?.white).toBeNull();
      await user.press(screen.getByTestId('online-notice-ok-button'));

      offline = false;
      await user.press(screen.getByTestId('roll-button'));
      expect(view(game).version).toBeGreaterThan(version);
      expect(view(game).game.opening?.white ?? view(game).game.opening?.ties.length).toBeTruthy();
    });
  });

  describe('the roll on tap (#355)', () => {
    /** White waits to roll on the start position (no opening roll). */
    const whiteToRoll = (server: MemoryGameServer, id: string) => {
      const flow = viewFlow(server.getGame(id)!);
      const { game } = flow;
      server.setFlowForTest(id, {
        ...flow,
        game: {
          ...game,
          phase: 'awaiting-roll',
          opening: null,
          starter: 'white',
          state: { ...game.state, toMove: 'white', dice: null, turnNumber: 1 },
          played: [],
          lastTurn: null,
          result: null,
        },
      });
    };
    /** The current game waits for `player` to roll, and every roll of theirs passes. */
    const stuck = (player: 'white' | 'black') => (server: MemoryGameServer, id: string) =>
      server.setFlowForTest(id, closedOut(viewFlow(server.getGame(id)!), player));
    const diceLabel = () =>
      screen.getByTestId('dice-row', { includeHiddenElements: true }).props.accessibilityLabel;
    /** The dice row names the higher die first. */
    const high = (dice: readonly number[]) => [...dice].sort((a, b) => b - a).join('-');
    /** The dice in either order. */
    const either = ([a, b]: readonly number[]) => `(${a}-${b}|${b}-${a})`;
    const diceText = (dice: readonly number[]) =>
      dice[0] === dice[1] ? /^You rolled double/ : new RegExp(`^You rolled ${either(dice)}`);
    const passText = (who: string, dice: readonly number[]) =>
      new RegExp(`${who} rolled ${either(dice)}\\. No checker can move\\.`);

    it('asks the server to roll when you tap Roll, then throws its dice', async () => {
      const user = setupUser();
      const announce = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => undefined);
      const game = await openGame('portes', 1, 5, BOT_THINK_MS, undefined, whiteToRoll);
      await untilYourTurn(game, { roll: false });
      const version = view(game).version;
      // Nobody has rolled: the board waits for your roll, as offline.
      expect(view(game).game.state.dice).toBeNull();
      const button = screen.getByTestId('roll-button');
      expect(button).toHaveAccessibleName(/Roll dice/);
      expect(screen.queryByTestId('board-dice')).toBeNull();
      expect(screen.queryByTestId('confirm-button')).toBeNull();
      expect(screen.getByTestId('strip-bottom')).toHaveTextContent(/your turn/i);
      sounds.played.length = 0;
      announce.mockClear();
      mockThrows.length = 0;

      await user.press(button);
      // The server rolled and saved; its dice show with the roll's sound and text.
      expect(view(game).version).toBe(version + 1);
      const dice = view(game).game.state.dice!;
      expect(dice).not.toBeNull();
      // The throw comes from your side (#373: no far wall).
      expect(mockThrows).toEqual([{ wall: undefined, values: dice }]);
      expect(screen.getByTestId('board-dice')).toBeOnTheScreen();
      expect(diceLabel()).toMatch(new RegExp(`^Dice ${high(dice)}`));
      expect(sounds.played.filter((s) => s === 'diceRoll')).toHaveLength(1);
      expect(announce.mock.calls.map(([text]) => String(text))).toContainEqual(
        expect.stringMatching(diceText(dice)),
      );
      expect(screen.queryByTestId('roll-button')).toBeNull();

      // The turn plays and goes to the server as before.
      await playTurnByTaps(game);
      await user.press(screen.getByTestId('confirm-button'));
      expect(view(game).game.lastTurn).toEqual(expect.objectContaining({ player: 'white', dice }));
      expect(screen.getByTestId('online-wait')).toBeOnTheScreen();
      announce.mockRestore();
    });

    it('asks the server to roll on a swipe', async () => {
      const game = await openGame('portes', 1, 5, BOT_THINK_MS, undefined, whiteToRoll);
      await untilYourTurn(game, { roll: false });
      const version = view(game).version;
      expect(screen.getByTestId('roll-button')).toBeOnTheScreen();
      await touch('game-swipe-area', [
        { x: 187, y: 6 },
        { x: 187, y: 60 },
      ]);
      expect(screen.queryByTestId('roll-button')).toBeNull();
      expect(view(game).version).toBe(version + 1);
      const dice = view(game).game.state.dice!;
      expect(diceLabel()).toMatch(new RegExp(`^Dice ${high(dice)}`));
    });

    it('brings the Roll button back when the roll does not reach the server', async () => {
      const user = setupUser();
      let offline = true;
      const game = await openGame(
        'portes',
        1,
        5,
        BOT_THINK_MS,
        (server) => {
          const real = server.transportFor('me');
          return {
            subscribe: (id, onView, onError) => real.subscribe(id, onView, onError),
            rollDice: (request) =>
              offline ? Promise.reject(new Error('offline')) : real.rollDice(request),
            sendTurn: (request) => real.sendTurn(request),
            setDraft: (request) => real.setDraft(request),
            sendAnswer: (request) => real.sendAnswer(request),
            resign: (id) => real.resign(id),
            listMyGames: (request) => real.listMyGames(request),
            watchMyGames: (request, onList, onError) => real.watchMyGames(request, onList, onError),
          };
        },
        whiteToRoll,
      );
      await untilYourTurn(game, { roll: false });
      const version = view(game).version;
      sounds.played.length = 0;

      await user.press(screen.getByTestId('roll-button'));
      // Nothing rolled: no dice, no roll sound, and a card says why.
      expect(view(game).version).toBe(version);
      expect(await screen.findByTestId('online-notice-card')).toHaveTextContent(
        /did not reach the server/,
      );
      expect(screen.queryByTestId('board-dice')).toBeNull();
      expect(sounds.played).not.toContain('diceRoll');
      await user.press(screen.getByTestId('online-notice-ok-button'));
      await wait(1000);
      expect(screen.queryByTestId('board-dice')).toBeNull();

      // The Roll button is back, and works once the network is back.
      offline = false;
      await user.press(screen.getByTestId('roll-button'));
      expect(view(game).version).toBe(version + 1);
      expect(screen.getByTestId('board-dice')).toBeOnTheScreen();
    });

    it('shows the dice of your roll with no legal move first, then the pass card', async () => {
      const game = await openGame('portes', 1, 5, BOT_THINK_MS, undefined, stuck('white'));
      await untilYourTurn(game, { roll: false });
      await act(async () => {
        fireEvent.press(screen.getByTestId('roll-button'));
      });
      // The server passed your roll and waits for the bot.
      const passed = view(game);
      expect(passed.waitingFor).toBe('black');
      expect(passed.game.lastTurn).toMatchObject({ player: 'white', moves: [] });
      const dice = passed.game.lastTurn!.dice;
      // Your dice show; the card waits for them.
      expect(screen.queryByTestId('roll-button')).toBeNull();
      expect(screen.queryByTestId('pass-card')).toBeNull();
      expect(diceLabel()).toMatch(new RegExp(`^Dice ${high(dice)}`));
      await wait(PASS_AFTER_THROW_MS + ONLINE_PASS_DICE_MS);
      expect(screen.getByTestId('pass-card')).toHaveTextContent(passText('You', dice));
      // The bot waits for the card too before it rolls.
      expect(view(game).version).toBe(passed.version);
    });

    it('shows the bot’s roll with no legal move: its dice, the pass card, then your Roll', async () => {
      const game = await openGame('portes', 1, 5, BOT_THINK_MS, undefined, stuck('black'));
      expect(view(game).waitingFor).toBe('black');
      // The bot taps Roll after a moment, as a person would.
      await wait(ONLINE_BOT_ROLL_MS);
      const passed = view(game);
      expect(passed.waitingFor).toBe('white');
      expect(passed.game.lastTurn).toMatchObject({ player: 'black', moves: [] });
      const dice = passed.game.lastTurn!.dice;
      // Its dice are thrown first, from its wall (#373): no card, no Roll yet.
      expect(mockThrows).toEqual([{ wall: 'top', values: dice }]);
      expect(screen.queryByTestId('pass-card')).toBeNull();
      expect(screen.queryByTestId('roll-button')).toBeNull();
      expect(diceLabel()).toMatch(new RegExp(`^Dice ${high(dice)}`));
      // The card waits until the thrown dice have shown, as after your throw.
      await wait(PASS_AFTER_THROW_MS);
      expect(screen.getByTestId('pass-card')).toHaveTextContent(passText(botName(game), dice));
      expect(screen.queryByTestId('roll-button')).toBeNull();
      // The card closes by itself; then your turn waits for your roll.
      await wait(BOT_PASS_NOTICE_MS);
      expect(screen.queryByTestId('pass-card')).toBeNull();
      expect(screen.getByTestId('roll-button')).toBeOnTheScreen();
    });

    /** The bot's turn waits for its roll. */
    const blackToRoll = (server: MemoryGameServer, id: string) => {
      whiteToRoll(server, id);
      const flow = viewFlow(server.getGame(id)!);
      server.setFlowForTest(id, {
        ...flow,
        game: { ...flow.game, state: { ...flow.game.state, toMove: 'black' } },
      });
    };

    it('throws the bot’s dice from its wall when its roll arrives', async () => {
      const game = await openGame('portes', 1, 5, BOT_THINK_MS, undefined, blackToRoll);
      expect(view(game).waitingFor).toBe('black');
      sounds.played.length = 0;
      await wait(ONLINE_BOT_ROLL_MS);
      // The bot rolled; it thinks before its moves.
      expect(view(game).game.phase).toBe('moving');
      const dice = view(game).game.state.dice!;
      // Its dice come in over the board from its wall, the far one (#373).
      expect(mockThrows).toEqual([{ wall: 'top', values: dice }]);
      expect(screen.getByTestId('board-dice')).toBeOnTheScreen();
      expect(diceLabel()).toMatch(new RegExp(`^Dice ${high(dice)}`));
      expect(sounds.played.filter((s) => s === 'diceRoll')).toHaveLength(1);
      expect(screen.getByTestId('online-wait')).toBeOnTheScreen();
    });

    it('only tumbles the bot’s dice with Reduce Motion on', async () => {
      const still = jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
      const game = await openGame('portes', 1, 5, BOT_THINK_MS, undefined, blackToRoll);
      await wait(ONLINE_BOT_ROLL_MS);
      expect(view(game).game.phase).toBe('moving');
      const dice = view(game).game.state.dice!;
      expect(mockThrows).toEqual([]);
      expect(diceLabel()).toMatch(new RegExp(`^Dice ${high(dice)}`));
      still.mockRestore();
    });
  });

  it('locks the board while the server waits for the bot', async () => {
    const user = setupUser();
    // The bot thinks long: the taps below take a while.
    const game = await openGame('portes', 1, 5, 30_000);
    await untilYourTurn(game);
    await playTurnByTaps(game);
    await user.press(screen.getByTestId('confirm-button'));
    expect(view(game).waitingFor).toBe('black');
    // The bot's strip says the server waits for it, with its time left.
    expect(screen.getByTestId('strip-top')).toHaveTextContent(
      new RegExp(`Waiting for ${botName(game)}`, 'i'),
    );
    // A clock, never "60 s" (#499), next to a ring on the bot's seat (#530).
    expect(screen.getByTestId('strip-top-time')).toHaveTextContent(/^\d:\d\d$/);
    expect(screen.getByTestId('strip-top').props.accessibilityLabel).toMatch(/\d:\d\d to roll/);
    expect(screen.getByTestId('strip-top-ring', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('strip-bottom-ring', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId('confirm-button')).toBeNull();
    expect(screen.queryByTestId('undo-button')).toBeNull();
    // The bot's turn has no Roll button: the bot rolls on its own phone (#355).
    expect(screen.queryByTestId('roll-button')).toBeNull();

    // A tap on any point selects nothing: no target rings.
    for (let index = 1; index <= 24; index++) {
      await touch(PAN, [center(slotRect(geo, { kind: 'point', index }))]);
      expect(countNodes(screen.toJSON() as JsonNode, 'DashPathEffect')).toBe(0);
    }
    expect(view(game).waitingFor).toBe('black');
  });

  describe('the turn clock (#530)', () => {
    const colors = themes['walnut-kafeneio'].colors;
    /** The arc of the ring on `strip` (the time left), from the mocked Skia tree. */
    const arc = (strip: string) => {
      const [ring] = findAllNodes(
        screen.toJSON() as JsonNode,
        (node) => node.props.testID === `${strip}-ring`,
      );
      if (ring === undefined) return null;
      return findAllNodes(ring, (node) => node.type === 'Path' && 'start' in node.props)[0] ?? null;
    };
    const timeText = () => screen.getByTestId('strip-bottom-time', { includeHiddenElements: true });
    const ticks = () => sounds.played.filter((s) => s === 'clockTick').length;
    /** Moves the clock 1 s at a time until your last seconds show. */
    async function untilLastSeconds() {
      for (let i = 0; i < 200; i++) {
        if (screen.queryByText('Play now, or you lose this game') !== null) return;
        await wait(1000);
      }
      throw new Error('the last seconds never came');
    }
    /** Your time runs out: the server ends the game. */
    async function runOut(game: Game, turnMs: number) {
      await act(async () => {
        jest.advanceTimersByTime(turnMs + 1000);
        game.server.runDueTimeouts();
      });
    }

    it('rings your seat, turns red in the last 10 seconds, then ends the game', async () => {
      const announce = jest
        .spyOn(AccessibilityInfo, 'announceForAccessibility')
        .mockImplementation(() => {});
      const user = setupUser();
      const game = await openGame('portes', 1, 5);
      await untilYourTurn(game);

      // A gold ring on your seat, with the time left as a clock. The bot's
      // seat has no ring, and no clock line shows.
      expect(timeText()).toHaveTextContent(/^[01]:\d\d$/);
      expect(timeText()).toHaveStyle({ color: colors.turnText });
      expect(arc('strip-bottom')?.props.color).toBe(colors.turn);
      expect(arc('strip-top')).toBeNull();
      expect(screen.queryByTestId('strip-bottom-clock')).toBeNull();
      expect(screen.getByTestId('strip-bottom').props.accessibilityLabel).toMatch(
        /[01]:\d\d to move/,
      );
      // The ring empties as the time runs.
      const before = Number(arc('strip-bottom')?.props.start);
      await wait(5000);
      expect(Number(arc('strip-bottom')?.props.start)).toBeGreaterThan(before);
      // Still gold under 30 s: only the last 10 s are red.
      expect(screen.queryByText('Play now, or you lose this game')).toBeNull();

      sounds.played.length = 0;
      haptics.calls.length = 0;
      announce.mockClear();
      await untilLastSeconds();
      expect(timeText()).toHaveTextContent('0:10');
      expect(timeText()).toHaveStyle({ color: colors.problem });
      expect(arc('strip-bottom')?.props.color).toBe(colors.problem);
      expect(screen.getByTestId('strip-bottom')).toHaveStyle({ borderColor: colors.problem });
      expect(screen.getByTestId('strip-bottom').props.accessibilityLabel).toMatch(
        /Play now, or you lose this game/,
      );
      // Screen readers hear it once, not every second.
      expect(announce.mock.calls.map(([text]) => text)).toEqual([
        'Your time is almost up. Play now, or you lose this game.',
      ]);
      // A soft tick and a light haptic each second: 10, 9, … 1.
      for (let second = 9; second >= 1; second--) await wait(1000);
      expect(timeText()).toHaveTextContent('0:01');
      expect(ticks()).toBe(10);
      expect(haptics.calls.filter((h) => h === 'light')).toHaveLength(10);
      expect(announce).toHaveBeenCalledTimes(1);

      // You wait too long. The server ends the game (the in-memory server
      // runs its timers when asked).
      await runOut(game, 0);
      expect(view(game).match.games).toEqual([
        expect.objectContaining({ winner: 'black', reason: 'timeout' }),
      ]);
      expect(ticks()).toBe(10);
      const card = await screen.findByTestId('time-ran-out-card');
      expect(card).toHaveTextContent(/TIME RAN OUT/);
      expect(card).toHaveTextContent(new RegExp(`${botName(game)} wins this game`));
      expect(card).toHaveTextContent('1 point. The next game starts now.', { exact: false });
      // A friend game: no word of losing the match.
      expect(card).not.toHaveTextContent(/lose the match/);
      // In place of the game-end sheet; the board under it is hidden from
      // screen readers, and the card is read once.
      expect(screen.queryByTestId('game-end-card')).toBeNull();
      expect(screen.queryByTestId('game-board')).toBeNull();
      expect(
        screen.getByRole('header', { name: `Time ran out. ${botName(game)} wins this game` }),
      ).toBeOnTheScreen();
      expect(view(game).status).toBe('active');

      // "I am here" closes the card: the next game is on the board.
      await user.press(screen.getByTestId('time-ran-out-button'));
      expect(screen.queryByTestId('time-ran-out-card')).toBeNull();
      expect(screen.getByTestId('game-board')).toBeOnTheScreen();
      expect(game.onMatchOver).not.toHaveBeenCalled();
      announce.mockRestore();
    });

    it('warns in a ranked game, and two time outs in a row end the match', async () => {
      const user = setupUser();
      const game = await openGame(
        'portes',
        2,
        5,
        BOT_THINK_MS,
        undefined,
        undefined,
        true,
        undefined,
        {
          ranked: true,
        },
      );
      await untilYourTurn(game, { roll: false });
      expect(timeText()).toHaveTextContent(/^[12]:\d\d$/);
      await runOut(game, 2 * 60_000);
      const card = await screen.findByTestId('time-ran-out-card');
      expect(card).toHaveTextContent(
        '1 point. The next game starts now. Miss your next turn too and you lose the match.',
        { exact: false },
      );
      await user.press(screen.getByTestId('time-ran-out-button'));

      // Your next turn runs out too: the server ends the match.
      await untilYourTurn(game, { roll: false });
      await runOut(game, 2 * 60_000);
      expect(view(game).status).toBe('finished');
      expect(view(game).matchEndReason).toBe('timeouts-in-a-row');
      await wait(2000);
      expect(game.onMatchOver).toHaveBeenCalled();
    });

    it('keeps the clock line and no ring for a game with no turn time', async () => {
      const game = await openGame('portes', null, 5);
      await untilYourTurn(game);
      expect(screen.getByTestId('strip-bottom-clock')).toHaveTextContent(/\d+ h to move/);
      expect(screen.queryByTestId('strip-bottom-time')).toBeNull();
      expect(arc('strip-bottom')).toBeNull();
      expect(arc('strip-top')).toBeNull();
      expect(view(game).turnTimeMinutes).toBeNull();
    });
  });

  it('reads the same notice again when it comes back', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    // The spy is the setup's mock, which keeps the calls of earlier tests.
    announce.mockClear();
    const user = setupUser();
    // Your turns do not reach the server (no network) until `offline` is false.
    let offline = true;
    const game = await openGame('portes', 1, 5, BOT_THINK_MS, (server) => {
      const real = server.transportFor('me');
      return {
        subscribe: (id, onView, onError) => real.subscribe(id, onView, onError),
        rollDice: (request) => real.rollDice(request),
        sendTurn: (request) =>
          offline ? Promise.reject(new Error('offline')) : real.sendTurn(request),
        setDraft: (request) => real.setDraft(request),
        sendAnswer: (request) => real.sendAnswer(request),
        resign: (id) => real.resign(id),
        listMyGames: (request) => real.listMyGames(request),
        watchMyGames: (request, onList, onError) => real.watchMyGames(request, onList, onError),
      };
    });
    const notSent = () =>
      announce.mock.calls.filter(([text]) => String(text).startsWith('Not sent')).length;
    await untilYourTurn(game);
    await playTurnByTaps(game);

    // Twice the same notice on the same view: it is read both times.
    for (const times of [1, 2]) {
      await user.press(screen.getByTestId('confirm-button'));
      expect(await screen.findByTestId('online-notice-card')).toHaveTextContent(/Not sent/);
      expect(notSent()).toBe(times);
      await user.press(screen.getByTestId('online-notice-ok-button'));
      expect(screen.queryByTestId('online-notice-card')).toBeNull();
    }
    // Your moves stayed: Confirm sends them once the network is back.
    offline = false;
    const before = view(game).version;
    await user.press(screen.getByTestId('confirm-button'));
    expect(view(game).version).toBeGreaterThan(before);
    expect(view(game).game.lastTurn?.player).toBe('white');
    expect(notSent()).toBe(2);
    announce.mockRestore();
  });

  it('resigns the match while your turn is on its way: the resign goes after it', async () => {
    const user = setupUser();
    // Your turn waits on the way until `deliver()`.
    let deliver: (() => void) | null = null;
    const game = await openGame('portes', 1, 5, 30_000, (server) => {
      const real = server.transportFor('me');
      return {
        subscribe: (id, onView, onError) => real.subscribe(id, onView, onError),
        rollDice: (request) => real.rollDice(request),
        sendTurn: (request) =>
          new Promise<void>((resolve, reject) => {
            deliver = () => {
              real.sendTurn(request).then(resolve, reject);
            };
          }),
        setDraft: (request) => real.setDraft(request),
        sendAnswer: (request) => real.sendAnswer(request),
        resign: (id) => real.resign(id),
        listMyGames: (request) => real.listMyGames(request),
        watchMyGames: (request, onList, onError) => real.watchMyGames(request, onList, onError),
      };
    });
    await untilYourTurn(game);
    await playTurnByTaps(game);
    await user.press(screen.getByTestId('confirm-button'));
    expect(screen.getByTestId('online-wait')).toHaveTextContent('Sending your turn…');

    await user.press(screen.getByRole('button', { name: 'Game menu' }));
    await user.press(screen.getByTestId('menu-resign-match'));
    await user.press(screen.getByRole('button', { name: 'Resign' }));
    // Not yet: the turn is still on its way.
    expect(view(game).status).toBe('active');

    // The turn arrives, then the resign.
    await act(async () => {
      deliver!();
    });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(view(game).game.lastTurn?.player).toBe('white');
    expect(view(game).status).toBe('finished');
    expect(view(game).match.resignedBy).toBe('white');
    expect(game.onMatchOver).toHaveBeenCalledTimes(1);
  });

  it('resigns the match from the menu, then opens match end', async () => {
    const user = setupUser();
    const game = await openGame();
    await user.press(screen.getByRole('button', { name: 'Game menu' }));
    // Online you resign the whole match: there is no game resign.
    expect(screen.queryByTestId('menu-resign-game')).toBeNull();
    await user.press(screen.getByTestId('menu-resign-match'));
    expect(screen.getByTestId('resign-match-dialog')).toHaveTextContent(new RegExp(botName(game)));
    await user.press(screen.getByRole('button', { name: 'Resign' }));
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(view(game).status).toBe('finished');
    expect(view(game).match.resignedBy).toBe('white');
    expect(game.onMatchOver).toHaveBeenCalledTimes(1);
  });
  describe('Report or block (#435)', () => {
    const openWithSafety = () =>
      openGame('portes', 1, 5, BOT_THINK_MS, undefined, undefined, true, (server) =>
        server.safetyFor('me'),
      );

    it('blocks the other player from the menu', async () => {
      const user = setupUser();
      const game = await openWithSafety();
      const name = botName(game);
      await user.press(screen.getByRole('button', { name: 'Game menu' }));
      expect(screen.getByTestId('menu-report-block')).toHaveTextContent(
        new RegExp(`Block ${name}, or report them to us`),
      );
      await user.press(screen.getByTestId('menu-report-block'));
      expect(screen.getByRole('header', { name: `Report or block ${name}` })).toBeOnTheScreen();
      await user.press(screen.getByTestId('safety-block'));
      await user.press(screen.getByTestId('safety-block-yes'));
      await act(async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });
      // The dialog keeps the name it opened with.
      expect(screen.getByRole('header', { name: 'Player blocked' })).toBeOnTheScreen();
      const blocked = await game.server.safetyFor('me').listBlocked();
      expect(blocked.map((p) => p.playerId)).toEqual(['bot']);
      await user.press(screen.getByTestId('safety-close'));
      expect(screen.queryByTestId('safety-done')).toBeNull();
      // The game goes on.
      expect(view(game).status).toBe('active');
      // Opened again, the dialog asks the server and offers Report only: no second Block.
      await user.press(screen.getByRole('button', { name: 'Game menu' }));
      await user.press(screen.getByTestId('menu-report-block'));
      expect(await screen.findByTestId('safety-reasons')).toBeOnTheScreen();
      expect(screen.queryByTestId('safety-block')).toBeNull();
    });

    it('reports the other player from the menu', async () => {
      const user = setupUser();
      const game = await openWithSafety();
      await user.press(screen.getByRole('button', { name: 'Game menu' }));
      await user.press(screen.getByTestId('menu-report-block'));
      await user.press(screen.getByTestId('safety-report'));
      await user.press(screen.getByTestId('safety-reason-name'));
      await act(async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });
      expect(screen.getByTestId('safety-done')).toBeOnTheScreen();
      expect(game.server.reportsOf()).toEqual([
        expect.objectContaining({ reporterId: 'me', reportedId: 'bot', reason: 'name' }),
      ]);
    });

    it('a screen with no Safety port has no such row', async () => {
      const user = setupUser();
      await openGame();
      await user.press(screen.getByRole('button', { name: 'Game menu' }));
      expect(screen.queryByTestId('menu-report-block')).toBeNull();
    });
  });
});
