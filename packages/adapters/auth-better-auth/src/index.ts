/**
 * `AuthProvider` adapter backed by Better Auth (#131, ADR-0004).
 *
 * Guest sign-in, and sign-in keys (Apple, #397). The server side is the
 * Better Auth Convex component in `apps/server/convex/auth.ts`. See README.md.
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
  type BetterAuthFetchOptions,
  type BetterAuthIdTokenInput,
  type BetterAuthResult,
  type BetterAuthSocialData,
  type BetterAuthUserData,
  type FromBetterAuthClientOptions,
} from './provider';
export { createSecureSessionStorage } from './secureStore';
