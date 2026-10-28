/**
 * `GameTransport` on a Convex client (#253, ADR-0004).
 *
 * The client is any object with the two calls below: `ConvexClient` from
 * `convex/browser` fits, and a test can pass a fake. The calls carry no
 * player id: the client sends the sign-in token (`setAuth`), and the
 * server reads the caller from it (#131).
 */
import { ConvexError } from 'convex/values';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';

import { isGameTransportErrorData } from '@tavli/contracts';
import type {
  GameTransport,
  GameTransportErrorData,
  OnlineGameView,
  SendTurnRequest,
} from '@tavli/contracts';

import { GAME_FUNCTIONS } from './functions';
import type { WriteResult } from './functions';

/** The two Convex client calls the adapter needs. `ConvexClient` has both. */
export interface ConvexGameClient {
  /**
   * Calls `onResult` with the query result now and after every change, and
   * `onError` when the query throws. Returns a function that stops it.
   */
  onUpdate<Query extends FunctionReference<'query'>>(
    query: Query,
    args: FunctionArgs<Query>,
    onResult: (result: FunctionReturnType<Query>) => unknown,
    onError: (error: Error) => unknown,
  ): () => void;
  /** Runs a mutation. Resolves with its result once the server saved it. */
  mutation<Mutation extends FunctionReference<'mutation'>>(
    mutation: Mutation,
    args: FunctionArgs<Mutation>,
  ): Promise<Awaited<FunctionReturnType<Mutation>>>;
}

export interface ConvexGameTransportOptions {
  readonly client: ConvexGameClient;
}

/** `getGame` returns `null` for a missing game; the port wants `NOT_FOUND`. */
function notFound(): GameTransportErrorData {
  return { code: 'NOT_FOUND', message: 'no game with this id' };
}

/**
 * True for a `ConvexError`. It also checks the name, not only
 * `instanceof`: when two copies of `convex/values` load (ESM and CJS), a
 * real server error is not an instance of this copy's class.
 */
export function isConvexError(error: unknown): error is { readonly data: unknown } {
  if (error instanceof ConvexError) return true;
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'ConvexError' &&
    'data' in error
  );
}

/**
 * A server error (`ConvexError` with `GameTransportErrorData`) becomes that
 * data, as plain JSON. Any other error (the network, a bad argument)
 * stays as it is.
 */
export function toTransportError(error: unknown): unknown {
  if (isConvexError(error) && isGameTransportErrorData(error.data)) {
    return { code: error.data.code, message: error.data.message };
  }
  return error;
}

/**
 * A copy of a view. The Convex client gives every watcher of the same
 * query the same cached object, and the port promises each one its own.
 * A view is plain JSON, so a JSON round trip copies it whole.
 */
function copyView(view: OnlineGameView): OnlineGameView {
  return JSON.parse(JSON.stringify(view)) as OnlineGameView;
}

/** Runs a mutation; a rejection becomes the port's error (`toTransportError`). */
async function run<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw toTransportError(error);
  }
}

/** `ok: false` (the turn time ran out first) rejects with its `TIMED_OUT` data. */
function checkWrite(result: WriteResult): void {
  if (!result.ok) {
    const data: GameTransportErrorData = {
      code: result.error.code,
      message: result.error.message,
    };
    throw data;
  }
}

/**
 * Copies a move with only the fields the server takes. The server checks
 * its arguments strictly, so an extra field would fail the call. The copy
 * also means a later change to the request does not change the turn.
 */
function moveArg(move: SendTurnRequest['moves'][number]): SendTurnRequest['moves'][number] {
  const { from, to, die, capture } = move;
  return capture === undefined ? { from, to, die } : { from, to, die, capture };
}

export function createConvexGameTransport(options: ConvexGameTransportOptions): GameTransport {
  const { client } = options;

  return {
    subscribe(gameId, onView, onError) {
      let active = true;
      // The port never calls back inside `subscribe`, and never after the
      // stop function: each result goes out on a later microtask, if the
      // subscription still runs then.
      const later = (deliver: () => void) => {
        void Promise.resolve().then(() => {
          if (active) deliver();
        });
      };
      const stop = client.onUpdate(
        GAME_FUNCTIONS.getGame,
        { gameId },
        (view) => {
          later(() => {
            if (view === null) onError?.(notFound());
            else onView(copyView(view));
          });
        },
        (error) => {
          later(() => onError?.(toTransportError(error)));
        },
      );
      return () => {
        if (!active) return;
        active = false;
        stop();
      };
    },

    async sendTurn({ gameId, expectedVersion, moves }) {
      const args = { gameId, expectedVersion, moves: moves.map(moveArg) };
      checkWrite(await run(() => client.mutation(GAME_FUNCTIONS.makeMove, args)));
    },

    async sendAnswer({ gameId, expectedVersion, choice }) {
      const args = { gameId, expectedVersion, choice };
      checkWrite(await run(() => client.mutation(GAME_FUNCTIONS.answer, args)));
    },

    async resign(gameId) {
      await run(() => client.mutation(GAME_FUNCTIONS.resign, { gameId }));
    },
  };
}
