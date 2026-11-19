/**
 * HTTP routes, on the deployment's site URL:
 * - Better Auth's sign-in routes under `/api/auth` (#131). The app's auth
 *   client talks to them.
 * - `POST /apple/notifications`: Apple's server-to-server notices about
 *   Sign in with Apple (#398, `appleTokens.ts`).
 */

import { httpRouter } from 'convex/server';

import { appleNotifications } from './appleTokens';
import { authComponent, createAuth } from './auth';

const http = httpRouter();
// SPIKE (#637): the browser needs CORS on the sign-in routes.
authComponent.registerRoutes(http, createAuth, {
  cors: { allowedHeaders: ['expo-origin', 'x-skip-oauth-proxy'], exposedHeaders: ['set-auth-token'] },
});
http.route({ path: '/apple/notifications', method: 'POST', handler: appleNotifications });

export default http;
