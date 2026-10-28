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

/**
 * Routes no client may call. A user is deleted only by `deleteMyAccount`
 * (`account.ts`, #302): it resigns the user's games and deletes the
 * user's invites and push tokens first. The anonymous plugin's
 * `/delete-anonymous-user` would skip that. (`/delete-user` is off too,
 * as `user.deleteUser` is not enabled.)
 */
const DISABLED_PATHS = ['/delete-anonymous-user'];

/**
 * Builds Better Auth for one request (the HTTP routes in `http.ts`), or
 * for one mutation (`account.ts` uses its `internalAdapter`).
 */
export function createAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth({
    trustedOrigins: APP_ORIGINS,
    disabledPaths: DISABLED_PATHS,
    database: authComponent.adapter(ctx),
    plugins: [expo(), anonymous(), convex({ authConfig })],
  });
}
