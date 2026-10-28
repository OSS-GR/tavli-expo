/**
 * Online play in Jest (#266): `auth` and `games` of the `@/services` fake
 * (`jest.setup.ts`).
 *
 * - `auth` is the in-memory `AuthProvider` (`createMemoryAuthProvider`):
 *   guests `guest-1`, `guest-2`, … Nobody is signed in at the start.
 * - `games` is a `GameTransport` on the in-memory server
 *   (`createMemoryGameServer` from `@tavli/online`). Each call comes from
 *   the user signed in to `auth` at that moment, like the Convex adapter
 *   with the sign-in token. With nobody signed in it fails `NOT_SIGNED_IN`.
 *
 * A test makes games with `onlineFake.server().createGame(...)`. Each test
 * starts with a new server and nobody signed in (`resetOnlineFake`, called
 * in `test/afterEnv.ts`).
 */
import {
  createMemoryAuthProvider,
  createMemoryAuthStore,
  type GameTransport,
  type GameTransportErrorData,
} from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import { createMemoryGameServer, type MemoryGameServer } from '@tavli/online';

const NOT_SIGNED_IN: GameTransportErrorData = {
  code: 'NOT_SIGNED_IN',
  message: 'nobody is signed in',
};

function newServer(): MemoryGameServer {
  // Fixed dice, so tests are repeatable. The clock follows Jest's fake timers.
  return createMemoryGameServer({ rng: createSeededRng(7), now: () => Date.now() });
}

const authStore = createMemoryAuthStore();
const auth = createMemoryAuthProvider(authStore);
let server = newServer();

/** The transport of the signed-in user, or `null` when nobody is signed in. */
function caller(): GameTransport | null {
  const user = auth.currentUser();
  return user === null ? null : server.transportFor(user.id);
}

const games: GameTransport = {
  subscribe(gameId, onView, onError) {
    const transport = caller();
    if (transport !== null) return transport.subscribe(gameId, onView, onError);
    let active = true;
    // Later, never inside `subscribe`, like the real transport.
    void Promise.resolve().then(() => {
      if (active) onError?.({ ...NOT_SIGNED_IN });
    });
    return () => {
      active = false;
    };
  },
  sendTurn: (request) => caller()?.sendTurn(request) ?? Promise.reject({ ...NOT_SIGNED_IN }),
  sendAnswer: (request) => caller()?.sendAnswer(request) ?? Promise.reject({ ...NOT_SIGNED_IN }),
  resign: (gameId) => caller()?.resign(gameId) ?? Promise.reject({ ...NOT_SIGNED_IN }),
};

export const onlineFake = {
  auth,
  games,
  /** Where the fake keeps the session. Set `session` to sign a user in at once. */
  authStore,
  /** The in-memory server of the current test. */
  server: () => server,
};

/** A new server, and nobody signed in. */
export function resetOnlineFake(): void {
  authStore.session = null;
  authStore.guests = 0;
  server = newServer();
}
