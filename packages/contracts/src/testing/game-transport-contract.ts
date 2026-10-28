/**
 * The `GameTransport` port contract (#251), as plain async checks that
 * work in any test runner (Vitest in packages, Jest in the app).
 *
 *   for (const check of gameTransportContract()) {
 *     it(check.name, () => check.run(makeSubject()));
 *   }
 *
 * Make a new subject for each check. A check rejects with an `Error` when
 * the transport breaks the contract. The checks never wait on a clock:
 * they call `subject.settle()` in a loop while they wait for a view.
 */
import type { MoveInput, PlayerId } from '@tavli/engine';

import { isGameTransportErrorData } from '../game-transport';
import type {
  GameTransport,
  GameTransportErrorCode,
  OnlineGameChoice,
  OnlineGamePace,
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
  /** An id that names no game. */
  readonly missingGameId: () => Promise<string>;
  /** The transport of one side, or of a caller who is neither player. */
  readonly transportFor: (who: PlayerId | 'stranger') => GameTransport;
  /** A legal full turn for `view.waitingFor` (the contract has no engine at run time). */
  readonly legalTurn: (view: OnlineGameView) => readonly MoveInput[];
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

/** A new game, watched by both players, with its first view. */
async function startGame(subject: GameTransportContractSubject, gameId: string) {
  const white = watch(subject.transportFor('white'), gameId);
  const black = watch(subject.transportFor('black'), gameId);
  const watchers = { white, black };
  await firstView(subject, white);
  const view = await firstView(subject, black);
  return { gameId, watchers, view };
}

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
  ];
}
