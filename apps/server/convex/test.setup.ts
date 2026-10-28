// Shared test code. The file names have two dots, so Convex does not deploy
// them, and the glob below skips them (and tests and `.d.ts` files) too.

// The turn pickers are shared with `@tavli/online` (#251).
export { pickChoice, pickTurn } from '@tavli/online/testing';

/**
 * The Convex modules for convex-test: files with one dot, like Convex
 * deploys. (The convex-test docs use the extglob `!(*.*.*)*.*s`; the
 * Vite glob of Vitest 5 does not support it, so we use a negative pattern.)
 */
export const modules = import.meta.glob(['./**/*.*s', '!./**/*.*.*s']);
