/**
 * Sign-in with Better Auth (#131, ADR-0004).
 *
 * Only guest (anonymous) users for now. Apple, Google and email magic
 * link come in later issues. Then a guest can link one of them, and a
 * later issue moves the guest's games to the new id (`onLinkAccount`).
 *
 * The deployment needs `BETTER_AUTH_SECRET` (a long random secret). The
 * owner sets it with `npx convex env set`. It is never in the repo.
 */

import { createClient } from '@convex-dev/better-auth';
import type { GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth/minimal';
import { anonymous } from 'better-auth/plugins';

import { components } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import authConfig from './auth.config';

/** The Better Auth component: its tables and the helpers to read them. */
export const authComponent = createClient<DataModel>(components.betterAuth);

/** The app's URL scheme (`app.json`), so a sign-in can return to the app. */
const APP_ORIGINS = ['tavlaki://'];

/** Builds Better Auth for one request. The HTTP routes in `http.ts` use it. */
export function createAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth({
    trustedOrigins: APP_ORIGINS,
    database: authComponent.adapter(ctx),
    plugins: [expo(), anonymous(), convex({ authConfig })],
  });
}
