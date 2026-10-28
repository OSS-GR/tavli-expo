// The small parts of the online screen (#255): the remote turn, the clock
// text, the board store and the online bot, over the in-memory server.
import { ONLINE_GAME_CHOICES, TURN_TIME_MS, type OnlineGameChoice } from '@tavli/contracts';
import { applyMatchAction, createSeededRng, type MatchFlow } from '@tavli/engine';
import { createMemoryGameServer } from '@tavli/online';
import { pickTurn } from '@tavli/online/testing';

import i18n from '@/i18n';
import { botLevels, botRunner } from '@/services';

import { onlineBoardStore } from './boardStore';
import { clockText, clockTickMs } from './clock';
import { MAX_TRIES_PER_TURN, startOnlineBot, type OnlineBot } from './onlineBot';
import { createOnlineStore, viewFlow, type OnlineStore } from './onlineStore';
import { remoteTurn } from './remoteTurn';

const START = Date.UTC(2026, 9, 28, 12, 0, 0);

let open: (OnlineStore | OnlineBot)[] = [];
beforeEach(async () => {
  jest.useFakeTimers({ now: START });
  await i18n.changeLanguage('en');
});
afterEach(() => {
  for (const item of open) {
    if ('stop' in item) item.stop();
    else item.getState().dispose();
  }
  open = [];
  jest.useRealTimers();
});

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function serverWithGame(choice: OnlineGameChoice = 'portes', targetPoints = 3, seed = 5) {
  const server = createMemoryGameServer({ rng: createSeededRng(seed), now: () => Date.now() });
  const gameId = server.createGame(
    'me',
    { white: 'me', black: 'bot' },
    choice,
    targetPoints,
    'live',
  );
  return { server, gameId };
}

/** Plays a random full turn for the player the server waits for, from its own transport. */
async function playServerTurn(
  server: ReturnType<typeof serverWithGame>['server'],
  gameId: string,
  rng = createSeededRng(9),
) {
  const view = server.getGame(gameId)!;
  const player = view.waitingFor === 'white' ? 'me' : 'bot';
  await server
    .transportFor(player)
    .sendTurn({ gameId, expectedVersion: view.version, moves: pickTurn(view.game, rng) });
}

describe('remoteTurn', () => {
  it('replays the other player’s turn from the view before', async () => {
    const { server, gameId } = serverWithGame();
    // Until the bot is to move.
    while (server.getGame(gameId)!.waitingFor !== 'black') await playServerTurn(server, gameId);
    const before = viewFlow(server.getGame(gameId)!);
    await playServerTurn(server, gameId);
    const after = viewFlow(server.getGame(gameId)!);
    const turn = remoteTurn(before, after, 'white');
    expect(turn).not.toBeNull();
    expect(turn?.player).toBe('black');
    expect(turn?.moves).toEqual(after.game.lastTurn?.moves);
    // Your own turn, or a view that does not follow, does not fly.
    expect(remoteTurn(before, after, 'black')).toBeNull();
    expect(remoteTurn(after, after, 'white')).toBeNull();
  });

  it('does not fly a turn that does not start on the view before', async () => {
    const { server, gameId } = serverWithGame();
    while (server.getGame(gameId)!.waitingFor !== 'black') await playServerTurn(server, gameId);
    const start = viewFlow(server.getGame(gameId)!);
    // The bot plays, you play, the bot plays again: two views were missed.
    await playServerTurn(server, gameId);
    while (server.getGame(gameId)!.waitingFor !== 'white') await playServerTurn(server, gameId);
    const mine = viewFlow(server.getGame(gameId)!);
    await playServerTurn(server, gameId);
    while (server.getGame(gameId)!.waitingFor !== 'white') await playServerTurn(server, gameId);
    const later = viewFlow(server.getGame(gameId)!);
    expect(later.game.lastTurn?.player).toBe('black');
    expect(remoteTurn(start, later, 'white')).toBeNull();
    // Your own turn is not theirs to fly, even with a move on the board.
    const [move] = pickTurn(mine.game, createSeededRng(1));
    const moved = applyMatchAction(mine, { type: 'move', player: 'white', move: move! });
    expect(remoteTurn(moved, later, 'white')).toBeNull();
  });
});

describe('clockText', () => {
  const t = i18n.t;
  it('counts seconds live, rounded up', () => {
    expect(clockText(TURN_TIME_MS.live, 'live', t)).toBe('60 s');
    expect(clockText(41_200, 'live', t)).toBe('42 s');
    expect(clockText(0, 'live', t)).toBe('0 s');
    expect(clockText(-5, 'live', t)).toBe('0 s');
  });

  it('counts hours async, and minutes in the last hour', () => {
    expect(clockText(TURN_TIME_MS.async, 'async', t)).toBe('24 h');
    expect(clockText(90 * 60_000, 'async', t)).toBe('1 h');
    expect(clockText(40 * 60_000 - 1, 'async', t)).toBe('40 min');
    expect(clockTickMs('live')).toBe(1000);
    expect(clockTickMs('async')).toBeGreaterThan(1000);
  });

  it('has Greek words', async () => {
    await i18n.changeLanguage('el');
    expect(clockText(5 * 60 * 60_000, 'async', i18n.t)).toBe('5 ώρες');
    expect(clockText(1000, 'live', i18n.t)).toBe('1 δευτ.');
  });
});

describe('onlineBoardStore', () => {
  it('is null until the first view, then follows the flow only', async () => {
    const { server, gameId } = serverWithGame();
    const store = createOnlineStore({ transport: server.transportFor('me'), gameId, me: 'me' });
    open.push(store);
    expect(onlineBoardStore(store, gameId)).toBeNull();
    await flush();
    const board = onlineBoardStore(store, gameId)!;
    expect(board.getState().flow).toBe(store.getState().flow);
    expect(board.getState().matchKey).toBe(`online:${gameId}`);

    const seen: MatchFlow[] = [];
    const a = board.subscribe((state) => seen.push(state.flow));
    const b = board.subscribe((state) => seen.push(state.flow));
    // A field the board does not read: no new snapshot.
    const snapshot = board.getState();
    store.setState({ sending: true });
    expect(board.getState()).toBe(snapshot);
    expect(seen).toEqual([]);
    store.setState({ sending: false });
    // A new view: both listeners hear it, even after one read it first.
    await playServerTurn(server, gameId);
    await flush();
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(store.getState().flow);
    expect(seen[1]).toBe(store.getState().flow);
    a();
    b();
  });
});

describe('onlineBoardStore refusals', () => {
  it('gives a new snapshot for each refusal, also the same one twice', async () => {
    const { server, gameId } = serverWithGame();
    const store = createOnlineStore({ transport: server.transportFor('me'), gameId, me: 'me' });
    open.push(store);
    await flush();
    const board = onlineBoardStore(store, gameId)!;
    const errors: (string | null)[] = [];
    const stop = board.subscribe((state) => errors.push(state.lastError));
    // The server rolls: the store refuses a roll, with the same text each time.
    expect(board.getState().dispatch({ type: 'roll', player: 'white' })).toBe(false);
    expect(board.getState().dispatch({ type: 'roll', player: 'white' })).toBe(false);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toBe(errors[1]);
    expect(errors[0]).toMatch(/by itself/);
    stop();
  });
});

describe('startOnlineBot', () => {
  it('gives up on a turn the server keeps refusing, then waits for a new view', async () => {
    const { server, gameId } = serverWithGame();
    while (server.getGame(gameId)!.waitingFor !== 'black') await playServerTurn(server, gameId);
    const real = server.transportFor('bot');
    const sendTurn = jest.fn(() =>
      Promise.reject({ code: 'BAD_REQUEST', message: 'refused for the test' }),
    );
    const errors: unknown[] = [];
    open.push(
      startOnlineBot({
        transport: {
          subscribe: (id, onView, onError) => real.subscribe(id, onView, onError),
          sendTurn,
          sendAnswer: (request) => real.sendAnswer(request),
          resign: (id) => real.resign(id),
        },
        gameId,
        botId: 'bot',
        difficulty: botLevels.portes[0]!,
        runner: botRunner,
        rng: createSeededRng(2),
        timing: { thinkMs: () => 0 },
        onError: (error) => errors.push(error),
      }),
    );
    // Well within the turn time: the bot does not try again and again.
    for (let i = 0; i < 200; i++) {
      jest.advanceTimersByTime(100);
      await flush();
    }
    expect(sendTurn).toHaveBeenCalledTimes(MAX_TRIES_PER_TURN);
    expect(errors.map(String)).toContainEqual(expect.stringMatching(/gave up on version/));
    expect(server.getGame(gameId)!.waitingFor).toBe('black');
  });

  // Two bots, each on its own transport, play whole matches. They follow
  // `waitingFor` and the questions: an Asodio turn can keep the same player.
  it.each(ONLINE_GAME_CHOICES.filter((c) => botLevels[c].length > 0))(
    'plays a whole %s match against another bot',
    async (choice) => {
      const { server, gameId } = serverWithGame(choice, 1, 7);
      const level = botLevels[choice][0]!;
      const errors: unknown[] = [];
      for (const [player, seed] of [
        ['me', 1],
        ['bot', 2],
      ] as const) {
        open.push(
          startOnlineBot({
            transport: server.transportFor(player),
            gameId,
            botId: player,
            difficulty: level,
            runner: botRunner,
            rng: createSeededRng(seed),
            timing: { thinkMs: () => 0 },
            onError: (error) => errors.push(error),
          }),
        );
      }
      for (let i = 0; i < 5000 && server.getGame(gameId)!.status !== 'finished'; i++) {
        jest.advanceTimersByTime(10);
        await flush();
      }
      expect(errors).toEqual([]);
      const view = server.getGame(gameId)!;
      expect(view.status).toBe('finished');
      expect(view.match.winner).not.toBeNull();
      // Nobody ran out of time.
      expect(view.match.games.every((g) => g.reason !== 'timeout')).toBe(true);
    },
  );
});
