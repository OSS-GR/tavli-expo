// Fake Convex clients over one convex-test backend, for the client adapter
// tests (`convexTransport.test.ts`, `convexInvites.test.ts`). The file name
// has two dots, so Convex does not deploy it.
//
// Each client runs its calls as one signed-in user (`t.withIdentity`).
// After each mutation it runs the watched queries again, like the real
// client, which sends new query results before the mutation resolves.

import type { convexTest } from 'convex-test';
import type { FunctionReference } from 'convex/server';

import type { ConvexInvitesClient } from '@tavli/backend-convex';

/** A convex-test backend. */
export type Tester = ReturnType<typeof convexTest>;

// convex-test types each call from the reference it gets. The fake
// clients take any reference, so they pass it on untyped.
type AnyQuery = FunctionReference<'query'>;
type AnyMutation = FunctionReference<'mutation'>;

/** A query the fake client watches. */
interface Watched {
  readonly refresh: () => Promise<void>;
}

/**
 * Fake Convex clients over `t`, one per signed-in user. `settle()` waits
 * until every query run has finished. `refreshAll()` runs every watched
 * query again: call it after work that changed the database outside a
 * client mutation (scheduled functions, `t.run`).
 */
export function convexTestNetwork(t: Tester) {
  const watched = new Set<Watched>();
  const pending = new Set<Promise<void>>();

  function track(work: Promise<void>): void {
    pending.add(work);
    const done = () => {
      pending.delete(work);
    };
    work.then(done, done);
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([...watched].map((query) => query.refresh()));
  }

  /** A client of `subject`, or of nobody (no sign-in) when it is `null`. */
  function clientFor(subject: string | null): ConvexInvitesClient {
    const user = subject === null ? t : t.withIdentity({ subject });
    return {
      onUpdate(query, args, onResult, onError) {
        let active = true;
        // Like Convex: a result goes out only when it changed.
        let last: string | undefined;
        // One run at a time, so an old result never comes after a new one.
        let queue = Promise.resolve();
        const runOnce = async () => {
          let key: string;
          let deliver: () => void;
          try {
            const result = await user.query(query as AnyQuery, args);
            key = `result:${JSON.stringify(result)}`;
            deliver = () => onResult(result);
          } catch (error) {
            key = `error:${String(error)}`;
            deliver = () => onError(error as Error);
          }
          if (!active || key === last) return;
          last = key;
          deliver();
        };
        const entry: Watched = {
          refresh: () => {
            queue = queue.then(runOnce);
            track(queue);
            return queue;
          },
        };
        watched.add(entry);
        void entry.refresh();
        return () => {
          active = false;
          watched.delete(entry);
        };
      },
      query: (query, args) => user.query(query as AnyQuery, args),
      async mutation(fn, args) {
        try {
          return await user.mutation(fn as AnyMutation, args);
        } finally {
          // The real client has the new query results before the mutation resolves.
          await refreshAll();
        }
      },
    };
  }

  return {
    clientFor,
    refreshAll,
    settle: async () => {
      await Promise.all([...pending]);
      await Promise.resolve();
    },
  };
}
