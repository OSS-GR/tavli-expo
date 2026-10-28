/**
 * Who may sign tokens for this deployment (#131).
 *
 * One provider: Better Auth on this deployment's own site URL
 * (`CONVEX_SITE_URL`, set by Convex). It signs a JWT for each session.
 * Convex checks it and gives the functions `ctx.auth.getUserIdentity()`.
 * The player id is the token's `subject` (see `caller.ts`).
 */

import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config';
import type { AuthConfig } from 'convex/server';

export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;
