/**
 * HTTP routes (#131): Better Auth's sign-in routes under `/api/auth`, on
 * the deployment's site URL. The app's auth client talks to them.
 */

import { httpRouter } from 'convex/server';

import { authComponent, createAuth } from './auth';

const http = httpRouter();
authComponent.registerRoutes(http, createAuth);

export default http;
