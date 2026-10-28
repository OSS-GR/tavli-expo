/**
 * `GameTransport` adapter backed by Convex (#253, ADR-0004).
 *
 * It calls the functions in `apps/server/convex/games.ts`. The server
 * reads the caller from the sign-in token (`AuthProvider`). See README.md.
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
  type GameFunctions,
  type WriteResult,
} from './functions';
export {
  createConvexGameTransport,
  toTransportError,
  type ConvexGameClient,
  type ConvexGameTransportOptions,
} from './transport';
