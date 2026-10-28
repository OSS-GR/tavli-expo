/**
 * The `Invites` port on a Convex client (#281, ADR-0004).
 *
 * It calls the functions in `apps/server/convex/invites.ts`. Like the game
 * transport, no call carries a player id: the client sends the sign-in
 * token, and the server reads the caller from it (#131). `ConvexClient`
 * from `convex/browser` fits the client below; a test can pass a fake.
 */
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';

import { isInviteErrorData } from '@tavli/contracts';
import type { InviteView, Invites } from '@tavli/contracts';

import { INVITE_FUNCTIONS } from './functions';
import { isConvexError } from './transport';
import type { ConvexGameClient } from './transport';

/** The Convex client calls the invites need. `ConvexClient` has all three. */
export interface ConvexInvitesClient extends ConvexGameClient {
  /** Runs a query once. Resolves with its result. */
  query<Query extends FunctionReference<'query'>>(
    query: Query,
    args: FunctionArgs<Query>,
  ): Promise<Awaited<FunctionReturnType<Query>>>;
}

export interface ConvexInvitesOptions {
  readonly client: ConvexInvitesClient;
}

/**
 * A server error (`ConvexError` with `InviteErrorData`) becomes that data,
 * as plain JSON. Any other error (the network, a bad argument) stays as
 * it is.
 */
export function toInviteError(error: unknown): unknown {
  if (isConvexError(error) && isInviteErrorData(error.data)) {
    return { code: error.data.code, message: error.data.message };
  }
  return error;
}

/** Runs a call; a rejection becomes the port's error (`toInviteError`). */
async function run<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw toInviteError(error);
  }
}

/** A copy of a view: the Convex client shares one cached object between watchers. */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createConvexInvites(options: ConvexInvitesOptions): Invites {
  const { client } = options;

  return {
    async createInvite({ choice, targetPoints, pace }) {
      // Only the fields the server takes: it checks its arguments strictly.
      const args = { choice, targetPoints, pace };
      return await run(() => client.mutation(INVITE_FUNCTIONS.createInvite, args));
    },

    async getInvite(code) {
      const view = await run(() => client.query(INVITE_FUNCTIONS.getInvite, { code }));
      return view === null ? null : copy(view);
    },

    watchInvite(code, onView, onError) {
      let active = true;
      // Like `subscribe` of the game transport: never inside `watchInvite`,
      // never after the stop function.
      const later = (deliver: () => void) => {
        void Promise.resolve().then(() => {
          if (active) deliver();
        });
      };
      const stop = client.onUpdate(
        INVITE_FUNCTIONS.getInvite,
        { code },
        (view: InviteView | null) => {
          later(() => onView(view === null ? null : copy(view)));
        },
        (error) => {
          later(() => onError?.(toInviteError(error)));
        },
      );
      return () => {
        if (!active) return;
        active = false;
        stop();
      };
    },

    async acceptInvite(code) {
      return await run(() => client.mutation(INVITE_FUNCTIONS.acceptInvite, { code }));
    },

    async declineInvite(code) {
      await run(() => client.mutation(INVITE_FUNCTIONS.declineInvite, { code }));
    },

    async cancelInvite(code) {
      await run(() => client.mutation(INVITE_FUNCTIONS.cancelInvite, { code }));
    },

    async listMyInvites() {
      return copy(await run(() => client.query(INVITE_FUNCTIONS.listMyInvites, {})));
    },

    watchMyInvites(onList, onError) {
      let active = true;
      // Like `watchInvite`: never inside the call, never after the stop function.
      const later = (deliver: () => void) => {
        void Promise.resolve().then(() => {
          if (active) deliver();
        });
      };
      // `listMyInvites` is a Convex query, so the client watches it: the
      // server sends a new result whenever one of the caller's invites
      // changes (#314), also when `expireInvite` marks one expired.
      const stop = client.onUpdate(
        INVITE_FUNCTIONS.listMyInvites,
        {},
        (list) => {
          later(() => onList(copy(list)));
        },
        (error) => {
          later(() => onError?.(toInviteError(error)));
        },
      );
      return () => {
        if (!active) return;
        active = false;
        stop();
      };
    },
  };
}
