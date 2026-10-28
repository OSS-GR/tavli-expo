/**
 * The Convex app and its components (#131).
 *
 * Better Auth runs as a Convex component (ADR-0004). It keeps its own
 * tables (users, sessions, accounts, keys) apart from ours.
 */

import betterAuth from '@convex-dev/better-auth/convex.config';
import { defineApp } from 'convex/server';

const app = defineApp();
app.use(betterAuth);

export default app;
