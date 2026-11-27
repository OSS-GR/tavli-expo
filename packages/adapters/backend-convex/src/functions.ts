/**
 * References to the Convex functions in `apps/server/convex/games.ts`,
 * `invites.ts`, `push.ts`, `account.ts`, `appUpdate.ts`, `usernames.ts`,
 * `safety.ts`, `friends.ts`, `ratings.ts` and `matchmaking.ts`, by name. The adapter does not import the generated `api`
 * of `apps/server`: that would pull the server code (and Better Auth) into
 * the app's type check, and `apps/server` already depends on this package
 * for its tests.
 *
 * The names and types must match the server. `apps/server` checks them
 * against its `api` (`convex/convexTransport.test.ts` for the games,
 * `convex/convexInvites.test.ts` for the invites,
 * `convex/convexPushTokens.test.ts` for the push tokens,
 * `convex/convexOnlineData.test.ts` for the delete,
 * `convex/convexAppUpdates.test.ts` for the update policy,
 * `convex/convexUsernames.test.ts` for the usernames,
 * `convex/convexSafety.test.ts` for block and report,
 * `convex/convexFriends.test.ts` for the friends,
 * `convex/convexRatings.test.ts` for the ratings,
 * `convex/convexMatchmaking.test.ts` for Play ranked), so a rename
 * there fails a test.
 */
import { makeFunctionReference } from 'convex/server';
import type { FunctionReference } from 'convex/server';

import type {
  AppPlatform,
  AppUpdatePolicy,
  BlockedPlayer,
  BoardRow,
  ChatMessage,
  ChatSettings,
  ChatView,
  FoundPlayer,
  Friend,
  FriendRequests,
  FriendStatus,
  GameRecord,
  GameSummary,
  GameTransportErrorData,
  InviteView,
  LookingCounts,
  MyData,
  MyRating,
  MySeek,
  MyUsername,
  NewInvite,
  OnlineGameStatus,
  OnlineGameView,
  PlayerCard,
  PushLocale,
  PushPlatform,
  RecentPlayer,
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
  /** One game's record for the review (#604). A server from before #604 has no such function. */
  readonly gameRecord: FunctionReference<
    'query',
    'public',
    { gameId: string; gameNumber: number },
    GameRecord
  >;
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
  gameRecord: 'games:gameRecord',
  listMyGames: 'games:listMyGames',
} as const satisfies { readonly [K in keyof GameFunctions]: string };

export const GAME_FUNCTIONS: GameFunctions = {
  getGame: makeFunctionReference(GAME_FUNCTION_NAMES.getGame),
  rollDice: makeFunctionReference(GAME_FUNCTION_NAMES.rollDice),
  makeMove: makeFunctionReference(GAME_FUNCTION_NAMES.makeMove),
  setDraft: makeFunctionReference(GAME_FUNCTION_NAMES.setDraft),
  answer: makeFunctionReference(GAME_FUNCTION_NAMES.answer),
  resign: makeFunctionReference(GAME_FUNCTION_NAMES.resign),
  gameRecord: makeFunctionReference(GAME_FUNCTION_NAMES.gameRecord),
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
    // `locale` (#631) is optional on the server: older builds send none.
    { token: string; platform: PushPlatform; locale?: PushLocale },
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

/** Download my data in `apps/server/convex/myData.ts` (#445): an action. */
export interface MyDataFunctions {
  readonly exportMyData: FunctionReference<'action', 'public', Record<string, never>, MyData>;
}

/** The Convex function names (`module:function`) of the copy. */
export const MY_DATA_FUNCTION_NAMES = {
  exportMyData: 'myData:exportMyData',
} as const satisfies { readonly [K in keyof MyDataFunctions]: string };

export const MY_DATA_FUNCTIONS: MyDataFunctions = {
  exportMyData: makeFunctionReference(MY_DATA_FUNCTION_NAMES.exportMyData),
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

/** What `setMyUsername` takes (`SetUsernameRequest`). */
export type SetUsernameArgs = {
  name: string;
  acceptTerms?: string;
  ageChecked?: boolean;
};

/** The username functions in `apps/server/convex/usernames.ts` (#405). */
export interface UsernameFunctions {
  readonly getMyUsername: FunctionReference<'query', 'public', Record<string, never>, MyUsername>;
  readonly setMyUsername: FunctionReference<'mutation', 'public', SetUsernameArgs, MyUsername>;
}

/** The Convex function names (`module:function`) of the username calls. */
export const USERNAME_FUNCTION_NAMES = {
  getMyUsername: 'usernames:getMyUsername',
  setMyUsername: 'usernames:setMyUsername',
} as const satisfies { readonly [K in keyof UsernameFunctions]: string };

export const USERNAME_FUNCTIONS: UsernameFunctions = {
  getMyUsername: makeFunctionReference(USERNAME_FUNCTION_NAMES.getMyUsername),
  setMyUsername: makeFunctionReference(USERNAME_FUNCTION_NAMES.setMyUsername),
};

/** The block and report functions in `apps/server/convex/safety.ts` (#320). */
export interface SafetyFunctions {
  readonly blockPlayer: FunctionReference<'mutation', 'public', { playerId: string }, null>;
  readonly unblockPlayer: FunctionReference<'mutation', 'public', { playerId: string }, null>;
  readonly listMyBlocks: FunctionReference<
    'query',
    'public',
    Record<string, never>,
    BlockedPlayer[]
  >;
  readonly reportPlayer: FunctionReference<
    'mutation',
    'public',
    { playerId: string; reason: string; gameId?: string },
    null
  >;
}

/** The Convex function names (`module:function`) of the block and report calls. */
export const SAFETY_FUNCTION_NAMES = {
  blockPlayer: 'safety:blockPlayer',
  unblockPlayer: 'safety:unblockPlayer',
  listMyBlocks: 'safety:listMyBlocks',
  reportPlayer: 'safety:reportPlayer',
} as const satisfies { readonly [K in keyof SafetyFunctions]: string };

export const SAFETY_FUNCTIONS: SafetyFunctions = {
  blockPlayer: makeFunctionReference(SAFETY_FUNCTION_NAMES.blockPlayer),
  unblockPlayer: makeFunctionReference(SAFETY_FUNCTION_NAMES.unblockPlayer),
  listMyBlocks: makeFunctionReference(SAFETY_FUNCTION_NAMES.listMyBlocks),
  reportPlayer: makeFunctionReference(SAFETY_FUNCTION_NAMES.reportPlayer),
};

/** The chat functions in `apps/server/convex/chat.ts` (ADR-0011, #692). */
export interface ChatFunctions {
  readonly getChat: FunctionReference<'query', 'public', { gameId: string }, ChatView>;
  readonly sendChat: FunctionReference<
    'mutation',
    'public',
    { gameId: string; text: string; phrase?: string },
    ChatMessage
  >;
  readonly setChatMuted: FunctionReference<
    'mutation',
    'public',
    { gameId: string; muted: boolean },
    null
  >;
  readonly myChatSettings: FunctionReference<
    'query',
    'public',
    Record<string, never>,
    ChatSettings
  >;
  readonly setChatEnabled: FunctionReference<'mutation', 'public', { enabled: boolean }, null>;
}

/** The Convex function names (`module:function`) of the chat calls. */
export const CHAT_FUNCTION_NAMES = {
  getChat: 'chat:getChat',
  sendChat: 'chat:sendChat',
  setChatMuted: 'chat:setChatMuted',
  myChatSettings: 'chat:myChatSettings',
  setChatEnabled: 'chat:setChatEnabled',
} as const satisfies { readonly [K in keyof ChatFunctions]: string };

export const CHAT_FUNCTIONS: ChatFunctions = {
  getChat: makeFunctionReference(CHAT_FUNCTION_NAMES.getChat),
  sendChat: makeFunctionReference(CHAT_FUNCTION_NAMES.sendChat),
  setChatMuted: makeFunctionReference(CHAT_FUNCTION_NAMES.setChatMuted),
  myChatSettings: makeFunctionReference(CHAT_FUNCTION_NAMES.myChatSettings),
  setChatEnabled: makeFunctionReference(CHAT_FUNCTION_NAMES.setChatEnabled),
};

/** What `requestByUsername` returns: a failed request is a value, so the search stays counted. */
export type FriendRequestResult =
  { ok: true; status: FriendStatus } | { ok: false; code: string; message: string };

type FriendQuery<Result> = FunctionReference<'query', 'public', Record<string, never>, Result>;
type FriendMutation<Args extends Record<string, unknown>, Result> = FunctionReference<
  'mutation',
  'public',
  Args,
  Result
>;

/** The functions in `apps/server/convex/friends.ts` (#406). */
export interface FriendFunctions {
  readonly listFriends: FriendQuery<Friend[]>;
  readonly listFriendRequests: FriendQuery<FriendRequests>;
  readonly recentPlayers: FriendQuery<RecentPlayer[]>;
  readonly findPlayer: FriendMutation<{ username: string }, FoundPlayer | null>;
  readonly myFriendLink: FriendMutation<Record<string, never>, string>;
  readonly resetFriendLink: FriendMutation<Record<string, never>, string>;
  readonly openFriendLink: FunctionReference<
    'query',
    'public',
    { token: string },
    FoundPlayer | null
  >;
  readonly requestByLink: FriendMutation<{ token: string }, FriendStatus>;
  readonly requestByUsername: FriendMutation<{ username: string }, FriendRequestResult>;
  readonly sendFriendRequest: FriendMutation<{ playerId: string }, FriendStatus>;
  readonly acceptFriendRequest: FriendMutation<{ playerId: string }, null>;
  readonly declineFriendRequest: FriendMutation<{ playerId: string }, null>;
  readonly cancelFriendRequest: FriendMutation<{ playerId: string }, null>;
  readonly removeFriend: FriendMutation<{ playerId: string }, null>;
  readonly inviteFriend: FriendMutation<NewInviteArgs & { playerId: string }, string>;
  readonly listFriendInvites: FriendQuery<InviteView[]>;
  readonly playerCard: FunctionReference<'query', 'public', { playerId: string }, PlayerCard>;
}

export const FRIEND_FUNCTION_NAMES = {
  listFriends: 'friends:listFriends',
  listFriendRequests: 'friends:listFriendRequests',
  recentPlayers: 'friends:recentPlayers',
  findPlayer: 'friends:findPlayer',
  myFriendLink: 'friends:myFriendLink',
  resetFriendLink: 'friends:resetFriendLink',
  openFriendLink: 'friends:openFriendLink',
  requestByLink: 'friends:requestByLink',
  requestByUsername: 'friends:requestByUsername',
  sendFriendRequest: 'friends:sendFriendRequest',
  acceptFriendRequest: 'friends:acceptFriendRequest',
  declineFriendRequest: 'friends:declineFriendRequest',
  cancelFriendRequest: 'friends:cancelFriendRequest',
  removeFriend: 'friends:removeFriend',
  inviteFriend: 'friends:inviteFriend',
  listFriendInvites: 'friends:listFriendInvites',
  playerCard: 'friends:playerCard',
} as const satisfies { readonly [K in keyof FriendFunctions]: string };

export const FRIEND_FUNCTIONS: FriendFunctions = {
  listFriends: makeFunctionReference(FRIEND_FUNCTION_NAMES.listFriends),
  listFriendRequests: makeFunctionReference(FRIEND_FUNCTION_NAMES.listFriendRequests),
  recentPlayers: makeFunctionReference(FRIEND_FUNCTION_NAMES.recentPlayers),
  findPlayer: makeFunctionReference(FRIEND_FUNCTION_NAMES.findPlayer),
  myFriendLink: makeFunctionReference(FRIEND_FUNCTION_NAMES.myFriendLink),
  resetFriendLink: makeFunctionReference(FRIEND_FUNCTION_NAMES.resetFriendLink),
  openFriendLink: makeFunctionReference(FRIEND_FUNCTION_NAMES.openFriendLink),
  requestByLink: makeFunctionReference(FRIEND_FUNCTION_NAMES.requestByLink),
  requestByUsername: makeFunctionReference(FRIEND_FUNCTION_NAMES.requestByUsername),
  sendFriendRequest: makeFunctionReference(FRIEND_FUNCTION_NAMES.sendFriendRequest),
  acceptFriendRequest: makeFunctionReference(FRIEND_FUNCTION_NAMES.acceptFriendRequest),
  declineFriendRequest: makeFunctionReference(FRIEND_FUNCTION_NAMES.declineFriendRequest),
  cancelFriendRequest: makeFunctionReference(FRIEND_FUNCTION_NAMES.cancelFriendRequest),
  removeFriend: makeFunctionReference(FRIEND_FUNCTION_NAMES.removeFriend),
  inviteFriend: makeFunctionReference(FRIEND_FUNCTION_NAMES.inviteFriend),
  listFriendInvites: makeFunctionReference(FRIEND_FUNCTION_NAMES.listFriendInvites),
  playerCard: makeFunctionReference(FRIEND_FUNCTION_NAMES.playerCard),
};

type RatingQuery<Result> = FunctionReference<'query', 'public', Record<string, never>, Result>;

/** The functions in `apps/server/convex/ratings.ts` (#407). */
export interface RatingFunctions {
  readonly myRating: RatingQuery<MyRating>;
  readonly friendsBoard: RatingQuery<BoardRow[]>;
  readonly globalBoard: RatingQuery<BoardRow[]>;
  readonly setShowOnBoard: FunctionReference<'mutation', 'public', { shown: boolean }, null>;
}

export const RATING_FUNCTION_NAMES = {
  myRating: 'ratings:myRating',
  friendsBoard: 'ratings:friendsBoard',
  globalBoard: 'ratings:globalBoard',
  setShowOnBoard: 'ratings:setShowOnBoard',
} as const satisfies { readonly [K in keyof RatingFunctions]: string };

export const RATING_FUNCTIONS: RatingFunctions = {
  myRating: makeFunctionReference(RATING_FUNCTION_NAMES.myRating),
  friendsBoard: makeFunctionReference(RATING_FUNCTION_NAMES.friendsBoard),
  globalBoard: makeFunctionReference(RATING_FUNCTION_NAMES.globalBoard),
  setShowOnBoard: makeFunctionReference(RATING_FUNCTION_NAMES.setShowOnBoard),
};

type MatchQuery<Result> = FunctionReference<'query', 'public', Record<string, never>, Result>;

/** The functions in `apps/server/convex/matchmaking.ts` (#531). */
export interface MatchFunctions {
  readonly seek: FunctionReference<'mutation', 'public', { game: string }, null>;
  readonly cancelSeek: FunctionReference<'mutation', 'public', Record<string, never>, null>;
  readonly mySeek: MatchQuery<MySeek>;
  readonly lookingCounts: MatchQuery<LookingCounts>;
}

export const MATCH_FUNCTION_NAMES = {
  seek: 'matchmaking:seek',
  cancelSeek: 'matchmaking:cancelSeek',
  mySeek: 'matchmaking:mySeek',
  lookingCounts: 'matchmaking:lookingCounts',
} as const satisfies { readonly [K in keyof MatchFunctions]: string };

export const MATCH_FUNCTIONS: MatchFunctions = {
  seek: makeFunctionReference(MATCH_FUNCTION_NAMES.seek),
  cancelSeek: makeFunctionReference(MATCH_FUNCTION_NAMES.cancelSeek),
  mySeek: makeFunctionReference(MATCH_FUNCTION_NAMES.mySeek),
  lookingCounts: makeFunctionReference(MATCH_FUNCTION_NAMES.lookingCounts),
};
