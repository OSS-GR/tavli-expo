/**
 * The `GameTransport` port contract (#251), as plain async checks that
 * work in any test runner (Vitest in packages, Jest in the app).
 *
 *   for (const check of gameTransportContract()) {
 *     it(check.name, () => check.run(makeSubject()));
 *   }
 *
 * Make a new subject for each check. A check rejects with an `Error` when
 * the transport breaks the contract. The checks never wait on a real
 * clock: they call `subject.settle()` in a loop while they wait for a
 * view, and `subject.passTime()` to move the server clock.
 */
import type { MoveInput, PlayerId } from '@tavli/engine';

import { isGameTransportErrorData } from '../game-transport';
import type {
  GameSummary,
  GameTransport,
  GameTransportErrorCode,
  OnlineGameChoice,
  OnlineGamePace,
  OnlineGameStatus,
  OnlineGameView,
} from '../game-transport';

export interface GameTransportContractGame {
  readonly choice: OnlineGameChoice;
  readonly targetPoints: number;
  readonly pace: OnlineGamePace;
}

export interface GameTransportContractSubject {
  /** Creates a game between the two players (White and Black). Resolves to its id. */
  readonly createGame: (game: GameTransportContractGame) => Promise<string>;
  /**
   * Creates a Plakoto game where the server waits for the mother question:
   * one player's mother is pinned, and they must answer `resign` or
   * `playOn`. (`motherPin` in `@tavli/online/testing` builds the position.)
   */
  readonly createMotherQuestion: () => Promise<string>;
  /**
   * Creates a Portes game (3 points, live) where White, to move, bears off
   * its last checkers: every legal turn wins the game for 1 point, and
   * the match goes on. (`lastBearOff` in `@tavli/online/testing` builds
   * the position.)
   */
  readonly createWinningTurn: () => Promise<string>;
  /**
   * Creates a Portes game (1 point, live) that White is not in: the player
   * `black` plays the white side, the stranger the black side. Resolves
   * to its id.
   */
  readonly createOtherGame: () => Promise<string>;
  /** An id that names no game. */
  readonly missingGameId: () => Promise<string>;
  /** The transport of one side, or of a caller who is neither player. */
  readonly transportFor: (who: PlayerId | 'stranger') => GameTransport;
  /** A legal full turn for `view.waitingFor` (the contract has no engine at run time). */
  readonly legalTurn: (view: OnlineGameView) => readonly MoveInput[];
  /**
   * Moves the server clock forward by `ms` (a few seconds at most, far
   * less than a turn). Never wait on a real clock here.
   */
  readonly passTime: (ms: number) => Promise<void>;
  /**
   * Lets the transport deliver. The checks call it in a loop while they
   * wait for a view, and a few times to show that no view comes. Default:
   * wait one microtask. Never wait on a real clock here.
   */
  readonly settle?: () => Promise<void>;
}

export interface GameTransportContractCheck {
  readonly name: string;
  readonly run: (subject: GameTransportContractSubject) => Promise<void>;
}

/** `settle()` calls before a check gives up waiting. */
const MAX_SETTLES = 200;
/** `settle()` calls that must pass with no view, to show that none comes. */
const QUIET_SETTLES = 20;

const PORTES: GameTransportContractGame = { choice: 'portes', targetPoints: 3, pace: 'live' };

function same(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

function other(side: PlayerId): PlayerId {
  return side === 'white' ? 'black' : 'white';
}

function settler(subject: GameTransportContractSubject): () => Promise<void> {
  return subject.settle ?? (() => Promise.resolve());
}

async function waitUntil(
  subject: GameTransportContractSubject,
  done: () => boolean,
  what: string,
): Promise<void> {
  const settle = settler(subject);
  for (let i = 0; i < MAX_SETTLES; i++) {
    if (done()) return;
    await settle();
  }
  if (!done()) throw new Error(`gave up waiting for ${what}`);
}

async function stayQuiet(subject: GameTransportContractSubject): Promise<void> {
  const settle = settler(subject);
  for (let i = 0; i < QUIET_SETTLES; i++) await settle();
}

/** A subscription that keeps every view and error it gets. */
interface Watcher {
  readonly views: OnlineGameView[];
  readonly errors: unknown[];
  readonly stop: () => void;
  /** The last view. Throws when there is none. */
  readonly last: () => OnlineGameView;
}

function watch(transport: GameTransport, gameId: string): Watcher {
  const views: OnlineGameView[] = [];
  const errors: unknown[] = [];
  const stop = transport.subscribe(
    gameId,
    (view) => views.push(view),
    (error) => errors.push(error),
  );
  return {
    views,
    errors,
    stop,
    last: () => {
      const view = views[views.length - 1];
      if (view === undefined) throw new Error('no view yet');
      return view;
    },
  };
}

async function firstView(
  subject: GameTransportContractSubject,
  watcher: Watcher,
): Promise<OnlineGameView> {
  await waitUntil(subject, () => watcher.views.length > 0, 'the first view');
  return watcher.last();
}

async function viewAt(
  subject: GameTransportContractSubject,
  watcher: Watcher,
  version: number,
): Promise<OnlineGameView> {
  await waitUntil(
    subject,
    () => watcher.views.some((view) => view.version >= version),
    `the view at version ${version}`,
  );
  return watcher.last();
}

/** The side the server waits for. Throws when the match is over. */
function waiting(view: OnlineGameView): PlayerId {
  if (view.waitingFor === null) throw new Error('the server waits for nobody');
  return view.waitingFor;
}

/** Expects `call` to reject with `GameTransportErrorData` of this code. */
async function rejectsWith(
  call: Promise<unknown>,
  code: GameTransportErrorCode,
  what: string,
): Promise<void> {
  let failed = false;
  let reason: unknown;
  try {
    await call;
  } catch (error) {
    failed = true;
    reason = error;
  }
  if (!failed) throw new Error(`${what}: expected a ${code} rejection, but the call resolved`);
  if (!isGameTransportErrorData(reason)) {
    throw new Error(`${what}: the rejection is not GameTransportErrorData: ${String(reason)}`);
  }
  same(reason.code, code, `${what}: error code`);
}

/** The moves of a turn without their `capture` (the server fills it in). */
function plainMoves(moves: readonly MoveInput[] | undefined) {
  return (moves ?? []).map(({ from, to, die }) => ({ from, to, die }));
}

/** A new game, watched by both players, with its first view. */
async function startGame(subject: GameTransportContractSubject, gameId: string) {
  const white = watch(subject.transportFor('white'), gameId);
  const black = watch(subject.transportFor('black'), gameId);
  const watchers = { white, black };
  await firstView(subject, white);
  const view = await firstView(subject, black);
  return { gameId, watchers, view };
}

/** The ids of the caller's games with `status`, in the order the transport lists them. */
async function listedIds(transport: GameTransport, status: OnlineGameStatus): Promise<string[]> {
  return (await transport.listMyGames({ status })).map((summary) => summary.gameId);
}

/** The summary of `gameId` in the caller's list of `status`. Throws when it is not there. */
async function summaryOf(
  transport: GameTransport,
  status: OnlineGameStatus,
  gameId: string,
): Promise<GameSummary> {
  const summary = (await transport.listMyGames({ status })).find((s) => s.gameId === gameId);
  if (summary === undefined) throw new Error(`game ${gameId} is not in the ${status} list`);
  return summary;
}

/** The summary must match the view that `side` sees. */
function sameAsView(summary: GameSummary, view: OnlineGameView, side: PlayerId): void {
  same(summary.gameId, view.gameId, 'summary.gameId');
  same(summary.status, view.status, 'summary.status');
  same(summary.choice, view.choice, 'summary.choice');
  same(summary.presetId, view.match.rules.presetId, 'summary.presetId');
  same(summary.variant, view.game.state.variant, 'summary.variant');
  same(summary.targetPoints, view.match.targetPoints, 'summary.targetPoints');
  same(summary.pace, view.pace, 'summary.pace');
  same(summary.mySide, side, 'summary.mySide');
  same(summary.waitingFor, view.waitingFor, 'summary.waitingFor');
  same(summary.myTurn, view.waitingFor === side, 'summary.myTurn');
  same(summary.score, view.match.score, 'summary.score');
  same(summary.winner, view.match.winner, 'summary.winner');
  same(summary.turnDeadline, view.turnDeadline, 'summary.turnDeadline');
  if (typeof summary.updatedAt !== 'number') throw new Error('summary.updatedAt is not a number');
}

/** One second: the checks move the clock between changes, so each change has its own time. */
const TICK_MS = 1000;

export function gameTransportContract(): GameTransportContractCheck[] {
  return [
    {
      name: 'subscribe sends the first view on a later tick',
      run: async (subject) => {
        const gameId = await subject.createGame(PORTES);
        const watcher = watch(subject.transportFor('white'), gameId);
        same(watcher.views.length, 0, 'views inside subscribe()');
        const view = await firstView(subject, watcher);
        same(view.gameId, gameId, 'view.gameId');
        same(view.status, 'active', 'view.status');
        same(view.choice, 'portes', 'view.choice');
        same(view.pace, 'live', 'view.pace');
        same(view.game.phase, 'moving', 'view.game.phase');
        same(view.waitingFor, view.game.state.toMove, 'view.waitingFor');
        same(view.prompt, null, 'view.prompt');
        if (typeof view.turnDeadline !== 'number') throw new Error('no turn deadline');
        same(watcher.errors, [], 'errors');
        watcher.stop();
      },
    },
    {
      name: 'a legal turn reaches both players with version + 1',
      run: async (subject) => {
        const { gameId, watchers, view } = await startGame(
          subject,
          await subject.createGame(PORTES),
        );
        const mover = waiting(view);
        await subject.transportFor(mover).sendTurn({
          gameId,
          expectedVersion: view.version,
          moves: subject.legalTurn(view),
        });
        const white = await viewAt(subject, watchers.white, view.version + 1);
        const black = await viewAt(subject, watchers.black, view.version + 1);
        same(white.version, view.version + 1, 'White view version');
        same(black, white, 'Black view');
        same(white.game.lastTurn?.player, mover, 'game.lastTurn.player');
        same(white.game.played, [], 'game.played');
        watchers.white.stop();
        watchers.black.stop();
      },
    },
    {
      name: 'an old version gets STALE_VERSION',
      run: async (subject) => {
        const { gameId, watchers, view } = await startGame(
          subject,
          await subject.createGame(PORTES),
        );
        await subject.transportFor(waiting(view)).sendTurn({
          gameId,
          expectedVersion: view.version,
          moves: subject.legalTurn(view),
        });
        const next = await viewAt(subject, watchers.white, view.version + 1);
        if (next.status !== 'active') throw new Error('the match ended after one turn');
        await rejectsWith(
          subject.transportFor(waiting(next)).sendTurn({
            gameId,
            expectedVersion: view.version,
            moves: subject.legalTurn(next),
          }),
          'STALE_VERSION',
          'a turn on the old version',
        );
        await stayQuiet(subject);
        same(watchers.white.last().version, next.version, 'version after the stale turn');
        watchers.white.stop();
        watchers.black.stop();
      },
    },
    {
      name: 'the player who is not to move gets NOT_YOUR_TURN; a stranger gets NOT_A_PLAYER',
      run: async (subject) => {
        const { gameId, watchers, view } = await startGame(
          subject,
          await subject.createGame(PORTES),
        );
        const turn = { gameId, expectedVersion: view.version, moves: subject.legalTurn(view) };
        await rejectsWith(
          subject.transportFor(other(waiting(view))).sendTurn(turn),
          'NOT_YOUR_TURN',
          'a turn by the other player',
        );
        await rejectsWith(
          subject.transportFor('stranger').sendTurn(turn),
          'NOT_A_PLAYER',
          'a turn by a stranger',
        );
        await rejectsWith(
          subject.transportFor('stranger').resign(gameId),
          'NOT_A_PLAYER',
          'a resign by a stranger',
        );
        await stayQuiet(subject);
        same(watchers.white.last().version, view.version, 'version after the rejected calls');
        watchers.white.stop();
        watchers.black.stop();
      },
    },
    {
      name: 'a stranger cannot watch a game: subscribe gets NOT_A_PLAYER',
      run: async (subject) => {
        const gameId = await subject.createGame(PORTES);
        const watcher = watch(subject.transportFor('stranger'), gameId);
        same(watcher.errors.length, 0, 'errors inside subscribe()');
        await waitUntil(subject, () => watcher.errors.length > 0, 'the NOT_A_PLAYER error');
        const error = watcher.errors[0];
        if (!isGameTransportErrorData(error)) {
          throw new Error(`subscribe: the error is not GameTransportErrorData: ${String(error)}`);
        }
        same(error.code, 'NOT_A_PLAYER', 'subscribe error code');
        // The players play on; the stranger still sees nothing.
        const { watchers, view } = await startGame(subject, gameId);
        await subject.transportFor(waiting(view)).sendTurn({
          gameId,
          expectedVersion: view.version,
          moves: subject.legalTurn(view),
        });
        await viewAt(subject, watchers.white, view.version + 1);
        await stayQuiet(subject);
        same(watcher.views, [], 'views of a stranger');
        watcher.stop();
        watchers.white.stop();
        watchers.black.stop();
      },
    },
    {
      name: 'an incomplete turn gets ILLEGAL_MOVE',
      run: async (subject) => {
        const { gameId, watchers, view } = await startGame(
          subject,
          await subject.createGame(PORTES),
        );
        const moves = subject.legalTurn(view);
        await rejectsWith(
          subject.transportFor(waiting(view)).sendTurn({
            gameId,
            expectedVersion: view.version,
            moves: moves.slice(0, -1),
          }),
          'ILLEGAL_MOVE',
          'a turn without its last move',
        );
        await stayQuiet(subject);
        same(watchers.white.last().version, view.version, 'version after the incomplete turn');
        watchers.white.stop();
        watchers.black.stop();
      },
    },
    {
      name: 'only the asked player answers the Plakoto mother question',
      run: async (subject) => {
        const { gameId, watchers, view } = await startGame(
          subject,
          await subject.createMotherQuestion(),
        );
        if (view.prompt === null) throw new Error('no mother question');
        same(view.prompt.kind, 'motherPinned', 'prompt.kind');
        same(view.prompt.choices, ['resign', 'playOn'], 'prompt.choices');
        const asked = view.prompt.player;
        same(view.waitingFor, asked, 'view.waitingFor');
        const answer = { gameId, expectedVersion: view.version, choice: 'playOn' };
        await rejectsWith(
          subject.transportFor(other(asked)).sendAnswer(answer),
          'NOT_YOUR_TURN',
          'an answer by the other player',
        );
        await rejectsWith(
          subject.transportFor(asked).sendAnswer({ ...answer, choice: 'maybe' }),
          'ILLEGAL_ACTION',
          'an answer that is not a choice',
        );
        await rejectsWith(
          subject
            .transportFor(asked)
            .sendTurn({ gameId, expectedVersion: view.version, moves: [] }),
          'ILLEGAL_ACTION',
          'a turn while the question waits',
        );
        await subject.transportFor(asked).sendAnswer(answer);
        const after = await viewAt(subject, watchers.black, view.version + 1);
        same(after.version, view.version + 1, 'version after the answer');
        same(after.prompt, null, 'prompt after the answer');
        same(after.status, 'active', 'status after playOn');
        await rejectsWith(
          subject.transportFor(asked).sendAnswer(answer),
          'STALE_VERSION',
          'the same answer again',
        );
        watchers.white.stop();
        watchers.black.stop();
      },
    },
    {
      name: 'a turn that ends a game stays in previousGame while the match goes on',
      run: async (subject) => {
        const { gameId, watchers, view } = await startGame(
          subject,
          await subject.createWinningTurn(),
        );
        same(view.previousGame, null, 'previousGame in the first game');
        same(waiting(view), 'white', 'the side to move');
        const moves = subject.legalTurn(view);
        await subject.transportFor('white').sendTurn({
          gameId,
          expectedVersion: view.version,
          moves,
        });
        const white = await viewAt(subject, watchers.white, view.version + 1);
        const black = await viewAt(subject, watchers.black, view.version + 1);
        same(black, white, 'Black view');
        same(white.status, 'active', 'status after the first game');
        same(white.match.games.length, 1, 'finished games');
        // The next game has started; previousGame keeps the end of the first.
        same(white.game.result, null, 'game.result of the next game');
        const ended = white.previousGame;
        if (ended === null) throw new Error('no previousGame after the game ended');
        same(ended.phase, 'game-over', 'previousGame.phase');
        same(ended.result?.winner, 'white', 'previousGame.result.winner');
        same(ended.lastTurn?.player, 'white', 'previousGame.lastTurn.player');
        same(plainMoves(ended.lastTurn?.moves), plainMoves(moves), 'previousGame.lastTurn.moves');
        same(ended.state.board.off.white, 15, 'previousGame: White checkers off');
        same(ended.played, [], 'previousGame.played');
        // It stays until the next game ends.
        await subject.transportFor(waiting(white)).sendTurn({
          gameId,
          expectedVersion: white.version,
          moves: subject.legalTurn(white),
        });
        const next = await viewAt(subject, watchers.white, white.version + 1);
        same(next.previousGame, ended, 'previousGame after a turn of the next game');
        watchers.white.stop();
        watchers.black.stop();
      },
    },
    {
      name: 'resign finishes the match for both players',
      run: async (subject) => {
        const { gameId, watchers, view } = await startGame(
          subject,
          await subject.createGame(PORTES),
        );
        // The player who is not to move may resign too.
        const resigner = other(waiting(view));
        await subject.transportFor(resigner).resign(gameId);
        const white = await viewAt(subject, watchers.white, view.version + 1);
        const black = await viewAt(subject, watchers.black, view.version + 1);
        same(black, white, 'Black view');
        same(white.status, 'finished', 'status');
        same(white.match.winner, other(resigner), 'match.winner');
        same(white.waitingFor, null, 'waitingFor');
        same(white.turnDeadline, null, 'turnDeadline');
        await rejectsWith(
          subject.transportFor(waiting(view)).sendTurn({
            gameId,
            expectedVersion: white.version,
            moves: subject.legalTurn(view),
          }),
          'GAME_OVER',
          'a turn after the match',
        );
        await rejectsWith(
          subject.transportFor(resigner).resign(gameId),
          'GAME_OVER',
          'a resign after the match',
        );
        watchers.white.stop();
        watchers.black.stop();
      },
    },
    {
      name: 'no view arrives after unsubscribe',
      run: async (subject) => {
        const gameId = await subject.createGame(PORTES);
        // Stopped at once: not even the first view comes.
        const early = watch(subject.transportFor('white'), gameId);
        early.stop();
        const { watchers, view } = await startGame(subject, gameId);
        watchers.white.stop();
        await subject.transportFor(waiting(view)).sendTurn({
          gameId,
          expectedVersion: view.version,
          moves: subject.legalTurn(view),
        });
        await viewAt(subject, watchers.black, view.version + 1);
        await stayQuiet(subject);
        same(early.views.length, 0, 'views after stop() inside the same tick');
        same(
          watchers.white.views.map((v) => v.version),
          [view.version],
          'White versions after stop()',
        );
        watchers.black.stop();
      },
    },
    {
      name: 'a missing game rejects with NOT_FOUND',
      run: async (subject) => {
        const gameId = await subject.missingGameId();
        const watcher = watch(subject.transportFor('white'), gameId);
        await waitUntil(subject, () => watcher.errors.length > 0, 'the NOT_FOUND error');
        const error = watcher.errors[0];
        if (!isGameTransportErrorData(error)) {
          throw new Error(`subscribe: the error is not GameTransportErrorData: ${String(error)}`);
        }
        same(error.code, 'NOT_FOUND', 'subscribe error code');
        same(watcher.views, [], 'views of a missing game');
        watcher.stop();
        await rejectsWith(
          subject.transportFor('white').sendTurn({ gameId, expectedVersion: 1, moves: [] }),
          'NOT_FOUND',
          'a turn in a missing game',
        );
        await rejectsWith(
          subject.transportFor('white').sendAnswer({ gameId, expectedVersion: 1, choice: 'x' }),
          'NOT_FOUND',
          'an answer in a missing game',
        );
        await rejectsWith(
          subject.transportFor('white').resign(gameId),
          'NOT_FOUND',
          'a resign in a missing game',
        );
      },
    },
    {
      name: 'a view is a copy: changing it changes nothing on the server',
      run: async (subject) => {
        const { gameId, watchers, view } = await startGame(
          subject,
          await subject.createGame(PORTES),
        );
        const moves = subject.legalTurn(view);
        // Write over the White view as a careless client might.
        (watchers.white.last() as { version: number }).version = 999;
        const request = { gameId, expectedVersion: view.version, moves: [...moves] };
        const sent = subject.transportFor(waiting(view)).sendTurn(request);
        // Changing the request after the call does not change the turn.
        request.moves.length = 0;
        await sent;
        const after = await viewAt(subject, watchers.black, view.version + 1);
        same(after.version, view.version + 1, 'version after the turn');
        same(watchers.black.views[0]?.version, view.version, 'Black first view');
        watchers.white.stop();
        watchers.black.stop();
      },
    },
    {
      name: 'listMyGames lists only my own games, newest first',
      run: async (subject) => {
        same(
          await listedIds(subject.transportFor('stranger'), 'active'),
          [],
          'a list with no games',
        );
        const first = await subject.createGame(PORTES);
        await subject.passTime(TICK_MS);
        const second = await subject.createGame({
          choice: 'fevga',
          targetPoints: 5,
          pace: 'async',
        });
        await subject.passTime(TICK_MS);
        const other = await subject.createOtherGame();
        same(
          await listedIds(subject.transportFor('white'), 'active'),
          [second, first],
          'White games',
        );
        same(
          await listedIds(subject.transportFor('black'), 'active'),
          [other, second, first],
          'Black games',
        );
        same(
          await listedIds(subject.transportFor('stranger'), 'active'),
          [other],
          'stranger games',
        );
        // Each summary says what the player's own view says.
        const { watchers, view } = await startGame(subject, second);
        sameAsView(await summaryOf(subject.transportFor('white'), 'active', second), view, 'white');
        sameAsView(await summaryOf(subject.transportFor('black'), 'active', second), view, 'black');
        // In the other game, Black plays the white side.
        const otherWatcher = watch(subject.transportFor('black'), other);
        const otherView = await firstView(subject, otherWatcher);
        sameAsView(
          await summaryOf(subject.transportFor('black'), 'active', other),
          otherView,
          'white',
        );
        otherWatcher.stop();
        watchers.white.stop();
        watchers.black.stop();
      },
    },
    {
      name: 'listMyGames puts the game with the last change first',
      run: async (subject) => {
        const first = await subject.createGame(PORTES);
        await subject.passTime(TICK_MS);
        const second = await subject.createGame(PORTES);
        await subject.passTime(TICK_MS);
        const before = await summaryOf(subject.transportFor('white'), 'active', first);
        const { watchers, view } = await startGame(subject, first);
        await subject.transportFor(waiting(view)).sendTurn({
          gameId: first,
          expectedVersion: view.version,
          moves: subject.legalTurn(view),
        });
        const after = await viewAt(subject, watchers.white, view.version + 1);
        same(await listedIds(subject.transportFor('white'), 'active'), [first, second], 'order');
        const summary = await summaryOf(subject.transportFor('white'), 'active', first);
        if (!(summary.updatedAt > before.updatedAt)) {
          throw new Error(`updatedAt did not move on: ${before.updatedAt} → ${summary.updatedAt}`);
        }
        sameAsView(summary, after, 'white');
        watchers.white.stop();
        watchers.black.stop();
      },
    },
    {
      name: 'listMyGames filters by status: a finished game moves to finished',
      run: async (subject) => {
        const first = await subject.createGame(PORTES);
        await subject.passTime(TICK_MS);
        const second = await subject.createGame(PORTES);
        same(await listedIds(subject.transportFor('white'), 'finished'), [], 'finished at start');
        const { watchers, view } = await startGame(subject, first);
        await subject.passTime(TICK_MS);
        await subject.transportFor('black').resign(first);
        const after = await viewAt(subject, watchers.white, view.version + 1);
        for (const who of ['white', 'black'] as const) {
          const transport = subject.transportFor(who);
          same(await listedIds(transport, 'active'), [second], `${who} active games`);
          same(await listedIds(transport, 'finished'), [first], `${who} finished games`);
        }
        const summary = await summaryOf(subject.transportFor('white'), 'finished', first);
        sameAsView(summary, after, 'white');
        same(summary.status, 'finished', 'summary.status');
        same(summary.winner, 'white', 'summary.winner');
        same(summary.myTurn, false, 'summary.myTurn');
        same(summary.turnDeadline, null, 'summary.turnDeadline');
        watchers.white.stop();
        watchers.black.stop();
      },
    },
  ];
}
