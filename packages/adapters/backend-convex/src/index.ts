/**
 * `GameTransport` (#253), `Invites` (#281), `PushTokens` (#285),
 * `OnlineData` (#315), `AppUpdates` (#390), `Usernames` (#405), `Safety`
 * (#320), `Friends` (#406) and `Ratings` (#407) adapters backed by Convex
 * (ADR-0004).
 *
 * They call the functions in `apps/server/convex/games.ts`, `invites.ts`,
 * `push.ts`, `account.ts`, `appUpdate.ts`, `usernames.ts`, `safety.ts`,
 * `friends.ts` and `ratings.ts`. The server reads the caller from the sign-in token
 * (`AuthProvider`). See README.md.
 */
export {
  authTokenFetcher,
  createConvexClient,
  createConvexGameTransportFromUrl,
  type ConvexTokenFetcher,
} from './client';
export {
  createConvexAppUpdates,
  type ConvexAppUpdatesClient,
  type ConvexAppUpdatesOptions,
} from './appUpdates';
export {
  ACCOUNT_FUNCTION_NAMES,
  ACCOUNT_FUNCTIONS,
  APP_UPDATE_FUNCTION_NAMES,
  APP_UPDATE_FUNCTIONS,
  FRIEND_FUNCTION_NAMES,
  FRIEND_FUNCTIONS,
  GAME_FUNCTION_NAMES,
  GAME_FUNCTIONS,
  INVITE_FUNCTION_NAMES,
  INVITE_FUNCTIONS,
  PUSH_FUNCTION_NAMES,
  PUSH_FUNCTIONS,
  RATING_FUNCTION_NAMES,
  RATING_FUNCTIONS,
  SAFETY_FUNCTION_NAMES,
  SAFETY_FUNCTIONS,
  USERNAME_FUNCTION_NAMES,
  USERNAME_FUNCTIONS,
  type AccountFunctions,
  type AppUpdateFunctions,
  type FriendFunctions,
  type FriendRequestResult,
  type GameFunctions,
  type InviteFunctions,
  type NewInviteArgs,
  type PushFunctions,
  type RatingFunctions,
  type SafetyFunctions,
  type SetUsernameArgs,
  type UsernameFunctions,
  type WriteResult,
} from './functions';
export {
  createConvexFriends,
  toFriendsError,
  type ConvexFriendsClient,
  type ConvexFriendsOptions,
} from './friends';
export {
  createConvexRatings,
  toRatingsError,
  type ConvexRatingsClient,
  type ConvexRatingsOptions,
} from './ratings';
export {
  createConvexInvites,
  toInviteError,
  type ConvexInvitesClient,
  type ConvexInvitesOptions,
} from './invites';
export {
  createConvexOnlineData,
  type ConvexOnlineDataClient,
  type ConvexOnlineDataOptions,
} from './onlineData';
export {
  createConvexPushTokens,
  type ConvexPushTokensClient,
  type ConvexPushTokensOptions,
} from './pushTokens';
export {
  createConvexSafety,
  toSafetyError,
  type ConvexSafetyClient,
  type ConvexSafetyOptions,
} from './safety';
export {
  createConvexGameTransport,
  toTransportError,
  type ConvexGameClient,
  type ConvexGameTransportOptions,
} from './transport';
export {
  createConvexUsernames,
  toUsernameError,
  type ConvexUsernamesClient,
  type ConvexUsernamesOptions,
} from './usernames';
