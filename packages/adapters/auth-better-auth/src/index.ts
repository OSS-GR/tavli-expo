/**
 * `AuthProvider` adapter backed by Better Auth (#131, ADR-0004).
 *
 * Guest (anonymous) sign-in only for now. The server side is the Better
 * Auth Convex component in `apps/server/convex/auth.ts`. See README.md.
 */
export {
  createBetterAuthClient,
  createBetterAuthProvider,
  type BetterAuthProviderOptions,
  type SessionStorage,
} from './client';
export {
  fromBetterAuthClient,
  jwtPayload,
  type BetterAuthCallOptions,
  type BetterAuthClient,
  type BetterAuthResult,
  type BetterAuthUserData,
  type FromBetterAuthClientOptions,
} from './provider';
