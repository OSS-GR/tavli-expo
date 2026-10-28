/**
 * References to the Convex functions in `apps/server/convex/games.ts` and
 * `invites.ts`, by name. The adapter does not import the generated `api`
 * of `apps/server`: that would pull the server code (and Better Auth) into
 * the app's type check, and `apps/server` already depends on this package
 * for its tests.
 *
 * The names and types must match the server. `apps/server` checks them
 * against its `api` (`convex/convexTransport.test.ts` for the games,
 * `convex/convexInvites.test.ts` for the invites), so a rename there
 * fails a test.
 */
import { makeFunctionReference } from 'convex/server';
import type { FunctionReference } from 'convex/server';

import type {
  GameTransportErrorData,
  InviteView,
  NewInvite,
  OnlineGameView,
  SendTurnRequest,
} from '@tavli/contracts';

/** One move as the server takes it (`moveInput` in `games.ts`). */
type MoveArg = SendTurnRequest['moves'][number];

/**
 * What `makeMove` and `answer` return. `ok: false` means the turn time ran
 * out first: the server saved the time out instead of the call.
 */
export type WriteResult =
  | { readonly ok: true; readonly version: number }
  | {
      readonly ok: false;
      readonly version: number;
      readonly error: GameTransportErrorData & { readonly code: 'TIMED_OUT' };
    };

export interface GameFunctions {
  readonly getGame: FunctionReference<'query', 'public', { gameId: string }, OnlineGameView | null>;
  readonly makeMove: FunctionReference<
    'mutation',
    'public',
    { gameId: string; expectedVersion: number; moves: MoveArg[] },
    WriteResult
  >;
  readonly answer: FunctionReference<
    'mutation',
    'public',
    { gameId: string; expectedVersion: number; choice: string },
    WriteResult
  >;
  readonly resign: FunctionReference<'mutation', 'public', { gameId: string }, number>;
}

/** The Convex function names (`module:function`) the adapter calls. */
export const GAME_FUNCTION_NAMES = {
  getGame: 'games:getGame',
  makeMove: 'games:makeMove',
  answer: 'games:answer',
  resign: 'games:resign',
} as const satisfies { readonly [K in keyof GameFunctions]: string };

export const GAME_FUNCTIONS: GameFunctions = {
  getGame: makeFunctionReference(GAME_FUNCTION_NAMES.getGame),
  makeMove: makeFunctionReference(GAME_FUNCTION_NAMES.makeMove),
  answer: makeFunctionReference(GAME_FUNCTION_NAMES.answer),
  resign: makeFunctionReference(GAME_FUNCTION_NAMES.resign),
};

/** What `createInvite` takes: the game the inviter picks (`NewInvite`). */
export type NewInviteArgs = {
  choice: NewInvite['choice'];
  targetPoints: number;
  pace: NewInvite['pace'];
};

/** The functions in `apps/server/convex/invites.ts` (#281). */
export interface InviteFunctions {
  readonly createInvite: FunctionReference<'mutation', 'public', NewInviteArgs, string>;
  readonly getInvite: FunctionReference<'query', 'public', { code: string }, InviteView | null>;
  /** Returns the id of the new game. */
  readonly acceptInvite: FunctionReference<'mutation', 'public', { code: string }, string>;
  readonly declineInvite: FunctionReference<'mutation', 'public', { code: string }, null>;
  readonly cancelInvite: FunctionReference<'mutation', 'public', { code: string }, null>;
  readonly listMyInvites: FunctionReference<
    'query',
    'public',
    Record<string, never>,
    InviteView[]
  >;
}

/** The Convex function names (`module:function`) of the invite calls. */
export const INVITE_FUNCTION_NAMES = {
  createInvite: 'invites:createInvite',
  getInvite: 'invites:getInvite',
  acceptInvite: 'invites:acceptInvite',
  declineInvite: 'invites:declineInvite',
  cancelInvite: 'invites:cancelInvite',
  listMyInvites: 'invites:listMyInvites',
} as const satisfies { readonly [K in keyof InviteFunctions]: string };

export const INVITE_FUNCTIONS: InviteFunctions = {
  createInvite: makeFunctionReference(INVITE_FUNCTION_NAMES.createInvite),
  getInvite: makeFunctionReference(INVITE_FUNCTION_NAMES.getInvite),
  acceptInvite: makeFunctionReference(INVITE_FUNCTION_NAMES.acceptInvite),
  declineInvite: makeFunctionReference(INVITE_FUNCTION_NAMES.declineInvite),
  cancelInvite: makeFunctionReference(INVITE_FUNCTION_NAMES.cancelInvite),
  listMyInvites: makeFunctionReference(INVITE_FUNCTION_NAMES.listMyInvites),
};
