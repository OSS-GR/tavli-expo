/**
 * `GameTransport` (#253), `Invites` (#281), `PushTokens` (#285) and
 * `OnlineData` (#315) adapters backed by Convex (ADR-0004).
 *
 * They call the functions in `apps/server/convex/games.ts`, `invites.ts`,
 * `push.ts` and `account.ts`. The server reads the caller from the sign-in token
 * (`AuthProvider`). See README.md.
 */
export {
  authTokenFetcher,
  createConvexClient,
  createConvexGameTransportFromUrl,
  type ConvexTokenFetcher,
} from './client';
export {
  ACCOUNT_FUNCTION_NAMES,
  ACCOUNT_FUNCTIONS,
  GAME_FUNCTION_NAMES,
  GAME_FUNCTIONS,
  INVITE_FUNCTION_NAMES,
  INVITE_FUNCTIONS,
  PUSH_FUNCTION_NAMES,
  PUSH_FUNCTIONS,
  type AccountFunctions,
  type GameFunctions,
  type InviteFunctions,
  type NewInviteArgs,
  type PushFunctions,
  type WriteResult,
} from './functions';
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
  createConvexGameTransport,
  toTransportError,
  type ConvexGameClient,
  type ConvexGameTransportOptions,
} from './transport';
