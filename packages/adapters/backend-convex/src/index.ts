/**
 * `GameTransport` (#253) and `Invites` (#281) adapters backed by Convex
 * (ADR-0004).
 *
 * They call the functions in `apps/server/convex/games.ts` and
 * `invites.ts`. The server reads the caller from the sign-in token
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
  type GameFunctions,
  type InviteFunctions,
  type NewInviteArgs,
  type WriteResult,
} from './functions';
export {
  createConvexInvites,
  toInviteError,
  type ConvexInvitesClient,
  type ConvexInvitesOptions,
} from './invites';
export {
  createConvexGameTransport,
  toTransportError,
  type ConvexGameClient,
  type ConvexGameTransportOptions,
} from './transport';
