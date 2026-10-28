/**
 * The dev games of this app run (#266). They live on the in-memory server
 * (`onlineServer` in `@/services`), so their board and match end must use
 * it (`gameTransportFor`); any other online game uses the Convex server
 * (`games`, see `connection.ts`). A stopped dev game stays one, so its
 * match end still opens.
 *
 * No imports, so `test/afterEnv.ts` can reset it cheaply.
 */

const ids = new Set<string>();

/**
 * `startDevGame` and a dev invite call it for each game they start, and
 * the invite route for the game an Accept starts (#256: the invites run
 * on the in-memory server too).
 */
export function rememberDevGame(gameId: string): void {
  ids.add(gameId);
}

/** Is `gameId` a dev game of this app run? */
export function isDevGame(gameId: string): boolean {
  return ids.has(gameId);
}

/** Tests only: forgets the dev games, like a new app run. `test/afterEnv.ts` calls it. */
export function forgetDevGamesForTest(): void {
  ids.clear();
}
