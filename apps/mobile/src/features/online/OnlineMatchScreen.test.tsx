import {
  TURN_TIME_MS,
  type GameTransport,
  type OnlineGameChoice,
  type OnlineGamePace,
} from '@tavli/contracts';
import { applyMatchAction, createSeededRng, type MatchFlow } from '@tavli/engine';
import { createMemoryGameServer, type MemoryGameServer } from '@tavli/online';
import { getLayout, getTheme } from '@tavli/themes';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { buildSources } from '@/features/board/interaction';
import { fitBoardWithShadow, slotRect } from '@/features/board/geometry';
import { turnView } from '@/features/game/gameStore';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import { botRunner } from '@/services';

import { startOnlineBot, type OnlineBot } from './onlineBot';
import { OnlineMatchScreen } from './OnlineMatchScreen';
import { viewFlow } from './onlineStore';

import { center } from '../../../test/boardPlay';
import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { touch } from '../../../test/gestureHandlerMock';
import { renderWithRoot } from '../../../test/render';
import { countNodes, type JsonNode } from '../../../test/tree';

const SIZE = { width: 375, height: 500 };
const geo = fitBoardWithShadow(getLayout(getTheme('walnut-kafeneio'), 'portrait-rotated'), SIZE);
const PAN = 'game-board-pan';
/** The bot thinks this long before its whole turn arrives. */
const BOT_THINK_MS = 2000;

runOnFakeTimers();

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
  pace: OnlineGamePace = 'live',
  targetPoints = 5,
  botThinkMs = BOT_THINK_MS,
  meTransport: (server: MemoryGameServer) => GameTransport = (server) => server.transportFor('me'),
): Promise<Game> {
  const server = createMemoryGameServer({ rng: createSeededRng(21), now: () => Date.now() });
  const gameId = server.createGame('me', { white: 'me', black: 'bot' }, choice, targetPoints, pace);
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
    />,
  );
  const board = await screen.findByTestId('game-board', { includeHiddenElements: true });
  await act(async () => {
    fireEvent(board, 'layout', { nativeEvent: { layout: { x: 0, y: 0, ...SIZE } } });
  });
  return { server, gameId, onMatchOver };
}

const view = (game: Game) => game.server.getGame(game.gameId)!;

/** Moves the clock until the server waits for you, and the screen has that view. */
async function untilYourTurn(game: Game) {
  for (let i = 0; i < 200; i++) {
    if (view(game).waitingFor === 'white' && screen.queryByTestId('online-wait') === null) return;
    await act(async () => {
      jest.advanceTimersByTime(250);
    });
  }
  throw new Error('your turn never came');
}

/** Plays your whole turn by tap-tap on the board (the first legal target each time). */
async function playTurnByTaps(game: Game) {
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
    expect(screen.getByTestId('online-wait')).toHaveTextContent('Waiting for Opponent…');

    // The bot's whole turn arrives, and it is your turn again.
    await untilYourTurn(game);
    const last = view(game).game.lastTurn;
    expect(last?.player).toBe('black');
    expect(screen.getByTestId('confirm-button')).toBeOnTheScreen();
    expect(screen.getByTestId('strip-bottom')).toHaveTextContent(/your turn/i);
  });

  it('locks the board while the server waits for the bot', async () => {
    const user = setupUser();
    // The bot thinks long: the taps below take a while.
    const game = await openGame('portes', 'live', 5, 30_000);
    await untilYourTurn(game);
    await playTurnByTaps(game);
    await user.press(screen.getByTestId('confirm-button'));
    expect(view(game).waitingFor).toBe('black');
    // The bot's strip says the server waits for it, with its time left.
    expect(screen.getByTestId('strip-top')).toHaveTextContent(/waiting for opponent/i);
    expect(screen.getByTestId('strip-top')).toHaveTextContent(/\d+ s/);
    expect(screen.queryByTestId('confirm-button')).toBeNull();
    expect(screen.queryByTestId('undo-button')).toBeNull();

    // A tap on any point selects nothing: no target rings.
    for (let index = 1; index <= 24; index++) {
      await touch(PAN, [center(slotRect(geo, { kind: 'point', index }))]);
      expect(countNodes(screen.toJSON() as JsonNode, 'DashPathEffect')).toBe(0);
    }
    expect(view(game).waitingFor).toBe('black');
  });

  it('ends the game when your time runs out, and the next game starts', async () => {
    const user = setupUser();
    const game = await openGame('portes', 'live', 5);
    await untilYourTurn(game);
    expect(screen.getByTestId('strip-bottom')).toHaveTextContent(/\d+ s/);

    // You wait too long. The server ends the game (the in-memory server
    // runs its timers when asked).
    await act(async () => {
      jest.advanceTimersByTime(TURN_TIME_MS.live + 1000);
      game.server.runDueTimeouts();
    });
    expect(view(game).match.games).toEqual([
      expect.objectContaining({ winner: 'black', reason: 'timeout' }),
    ]);
    const sheet = await screen.findByTestId('game-end-card');
    expect(sheet).toHaveTextContent(/Opponent wins the game/);
    expect(sheet).toHaveTextContent(/You ran out of time/);
    expect(sheet).toHaveTextContent(/Next: game 2 · Portes/);
    expect(view(game).status).toBe('active');

    // The button closes the sheet: the next game is on the board.
    await user.press(screen.getByTestId('next-game-button'));
    expect(screen.queryByTestId('game-end-card')).toBeNull();
    expect(screen.getByTestId('game-board', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(game.onMatchOver).not.toHaveBeenCalled();
  });

  it('reads the same notice again when it comes back', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
    const user = setupUser();
    // Your turns do not reach the server (no network) until `offline` is false.
    let offline = true;
    const game = await openGame('portes', 'live', 5, BOT_THINK_MS, (server) => {
      const real = server.transportFor('me');
      return {
        subscribe: (id, onView, onError) => real.subscribe(id, onView, onError),
        sendTurn: (request) =>
          offline ? Promise.reject(new Error('offline')) : real.sendTurn(request),
        sendAnswer: (request) => real.sendAnswer(request),
        resign: (id) => real.resign(id),
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

  it('resigns the match from the menu, then opens match end', async () => {
    const user = setupUser();
    const game = await openGame();
    await user.press(screen.getByRole('button', { name: 'Game menu' }));
    // Online you resign the whole match: there is no game resign.
    expect(screen.queryByTestId('menu-resign-game')).toBeNull();
    await user.press(screen.getByTestId('menu-resign-match'));
    expect(screen.getByTestId('resign-match-dialog')).toHaveTextContent(/Opponent/);
    await user.press(screen.getByRole('button', { name: 'Resign' }));
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(view(game).status).toBe('finished');
    expect(view(game).match.resignedBy).toBe('white');
    expect(game.onMatchOver).toHaveBeenCalledTimes(1);
  });
});
