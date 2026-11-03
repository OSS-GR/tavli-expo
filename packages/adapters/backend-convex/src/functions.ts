/**
 * References to the Convex functions in `apps/server/convex/games.ts`,
 * `invites.ts`, `push.ts`, `account.ts` and `appUpdate.ts`, by name. The adapter does not import the generated `api`
 * of `apps/server`: that would pull the server code (and Better Auth) into
 * the app's type check, and `apps/server` already depends on this package
 * for its tests.
 *
 * The names and types must match the server. `apps/server` checks them
 * against its `api` (`convex/convexTransport.test.ts` for the games,
 * `convex/convexInvites.test.ts` for the invites,
 * `convex/convexPushTokens.test.ts` for the push tokens,
 * `convex/convexOnlineData.test.ts` for the delete,
 * `convex/convexAppUpdates.test.ts` for the update policy), so a rename
 * there fails a test.
 */
import { makeFunctionReference } from 'convex/server';
import type { FunctionReference } from 'convex/server';

import type {
  AppPlatform,
  AppUpdatePolicy,
  GameSummary,
  GameTransportErrorData,
  InviteView,
  NewInvite,
  OnlineGameStatus,
  OnlineGameView,
  PushPlatform,
  SendTurnRequest,
} from '@tavli/contracts';

/** One move as the server takes it (`moveInput` in `games.ts`). */
type MoveArg = SendTurnRequest['moves'][number];

/**
 * What `makeMove`, `answer` and `rollDice` return. `ok: false` means the
 * turn time ran out first. Then the server saved the time out instead of
 * the call.
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
  readonly rollDice: FunctionReference<
    'mutation',
    'public',
    { gameId: string; expectedVersion: number },
    WriteResult
  >;
  readonly makeMove: FunctionReference<
    'mutation',
    'public',
    { gameId: string; expectedVersion: number; moves: MoveArg[] },
    WriteResult
  >;
  /** The turn so far (#374). A server from before #374 has no such function. */
  readonly setDraft: FunctionReference<
    'mutation',
    'public',
    { gameId: string; expectedVersion: number; moves: MoveArg[] },
    null
  >;
  readonly answer: FunctionReference<
    'mutation',
    'public',
    { gameId: string; expectedVersion: number; choice: string },
    WriteResult
  >;
  readonly resign: FunctionReference<'mutation', 'public', { gameId: string }, number>;
  readonly listMyGames: FunctionReference<
    'query',
    'public',
    { status: OnlineGameStatus },
    GameSummary[]
  >;
}

/** The Convex function names (`module:function`) the adapter calls. */
export const GAME_FUNCTION_NAMES = {
  getGame: 'games:getGame',
  rollDice: 'games:rollDice',
  makeMove: 'games:makeMove',
  setDraft: 'games:setDraft',
  answer: 'games:answer',
  resign: 'games:resign',
  listMyGames: 'games:listMyGames',
} as const satisfies { readonly [K in keyof GameFunctions]: string };

export const GAME_FUNCTIONS: GameFunctions = {
  getGame: makeFunctionReference(GAME_FUNCTION_NAMES.getGame),
  rollDice: makeFunctionReference(GAME_FUNCTION_NAMES.rollDice),
  makeMove: makeFunctionReference(GAME_FUNCTION_NAMES.makeMove),
  setDraft: makeFunctionReference(GAME_FUNCTION_NAMES.setDraft),
  answer: makeFunctionReference(GAME_FUNCTION_NAMES.answer),
  resign: makeFunctionReference(GAME_FUNCTION_NAMES.resign),
  listMyGames: makeFunctionReference(GAME_FUNCTION_NAMES.listMyGames),
};

/** What `createInvite` takes: the game the inviter picks (`NewInvite`). */
export type NewInviteArgs = {
  choice: NewInvite['choice'];
  targetPoints: number;
  turnTimeMinutes: NewInvite['turnTimeMinutes'];
};

/** The functions in `apps/server/convex/invites.ts` (#281). */
export interface InviteFunctions {
  readonly createInvite: FunctionReference<'mutation', 'public', NewInviteArgs, string>;
  readonly getInvite: FunctionReference<'query', 'public', { code: string }, InviteView | null>;
  /** Returns the id of the new game. */
  readonly acceptInvite: FunctionReference<'mutation', 'public', { code: string }, string>;
  readonly declineInvite: FunctionReference<'mutation', 'public', { code: string }, null>;
  readonly cancelInvite: FunctionReference<'mutation', 'public', { code: string }, null>;
  readonly listMyInvites: FunctionReference<'query', 'public', Record<string, never>, InviteView[]>;
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

/** The push token functions in `apps/server/convex/push.ts` (#280, #285). */
export interface PushFunctions {
  readonly registerPushToken: FunctionReference<
    'mutation',
    'public',
    { token: string; platform: PushPlatform },
    null
  >;
  readonly removePushToken: FunctionReference<'mutation', 'public', { token: string }, null>;
}

/** The Convex function names (`module:function`) of the push token calls. */
export const PUSH_FUNCTION_NAMES = {
  registerPushToken: 'push:registerPushToken',
  removePushToken: 'push:removePushToken',
} as const satisfies { readonly [K in keyof PushFunctions]: string };

export const PUSH_FUNCTIONS: PushFunctions = {
  registerPushToken: makeFunctionReference(PUSH_FUNCTION_NAMES.registerPushToken),
  removePushToken: makeFunctionReference(PUSH_FUNCTION_NAMES.removePushToken),
};

/** The delete in `apps/server/convex/account.ts` (#302, #315). */
export interface AccountFunctions {
  readonly deleteMyAccount: FunctionReference<'mutation', 'public', Record<string, never>, null>;
}

/** The Convex function names (`module:function`) of the account calls. */
export const ACCOUNT_FUNCTION_NAMES = {
  deleteMyAccount: 'account:deleteMyAccount',
} as const satisfies { readonly [K in keyof AccountFunctions]: string };

export const ACCOUNT_FUNCTIONS: AccountFunctions = {
  deleteMyAccount: makeFunctionReference(ACCOUNT_FUNCTION_NAMES.deleteMyAccount),
};

/** The update policy in `apps/server/convex/appUpdate.ts` (#390). It needs no sign-in. */
export interface AppUpdateFunctions {
  readonly updatePolicy: FunctionReference<
    'query',
    'public',
    { platform: AppPlatform },
    AppUpdatePolicy
  >;
}

/** The Convex function names (`module:function`) of the update policy. */
export const APP_UPDATE_FUNCTION_NAMES = {
  updatePolicy: 'appUpdate:updatePolicy',
} as const satisfies { readonly [K in keyof AppUpdateFunctions]: string };

export const APP_UPDATE_FUNCTIONS: AppUpdateFunctions = {
  updatePolicy: makeFunctionReference(APP_UPDATE_FUNCTION_NAMES.updatePolicy),
};
