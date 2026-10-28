// Shared test code. The file names have two dots, so Convex does not deploy
// them, and the glob below skips them (and tests and `.d.ts` files) too.

import type { TestConvex } from 'convex-test';
import type { GenericSchema, SchemaDefinition } from 'convex/server';

import { components } from './_generated/api';

// The turn pickers are shared with `@tavli/online` (#251).
export { pickChoice, pickTurn } from '@tavli/online/testing';

/**
 * The Convex modules for convex-test: files with one dot, like Convex
 * deploys. (The convex-test docs use the extglob `!(*.*.*)*.*s`; the
 * Vite glob of Vitest 5 does not support it, so we use a negative pattern.)
 */
export const modules = import.meta.glob(['./**/*.*s', '!./**/*.*.*s']);

/** Each user gets its own email: Better Auth keeps emails unique. */
let usersMade = 0;

/**
 * Makes `count` Better Auth users (guests) and returns their ids: the
 * player ids a test signs in as (`t.withIdentity({ subject: id })`). The
 * calls that save the caller's id check that the user exists
 * (`existingPlayer`, #306), so a made-up subject such as `'alice'` gets
 * `NOT_SIGNED_IN` there. `t` must have the component
 * (`betterAuthTest.register(t)`).
 */
export async function authUsers(
  t: TestConvex<SchemaDefinition<GenericSchema, boolean>>,
  count: number,
): Promise<string[]> {
  return await t.run(async (ctx) => {
    const ids: string[] = [];
    while (ids.length < count) {
      const now = Date.now();
      const user = (await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: 'user',
          data: {
            name: '',
            email: `guest-${usersMade++}@test.invalid`,
            emailVerified: false,
            isAnonymous: true,
            createdAt: now,
            updatedAt: now,
          },
        },
      })) as { _id: string };
      ids.push(user._id);
    }
    return ids;
  });
}
