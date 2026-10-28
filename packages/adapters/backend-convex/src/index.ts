/**
 * `GameTransport` (#253), `Invites` (#281) and `PushTokens` (#285)
 * adapters backed by Convex (ADR-0004).
 *
 * They call the functions in `apps/server/convex/games.ts`, `invites.ts`
 * and `push.ts`. The server reads the caller from the sign-in token
 * (`AuthProvider`). See README.md.
 */
export {
  authTokenFetcher,
  createConvexClient,
  createConvexGameTransportFromUrl,
  type ConvexTokenFetcher,
} from './client';
export {
  GAME_FUNCTION_NAMES,
  GAME_FUNCTIONS,
  INVITE_FUNCTION_NAMES,
  INVITE_FUNCTIONS,
  PUSH_FUNCTION_NAMES,
  PUSH_FUNCTIONS,
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
