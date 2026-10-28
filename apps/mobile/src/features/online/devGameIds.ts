/**
 * The dev games and dev invites of this app run (#266, #281). They live on
 * the in-memory server (`onlineServer` in `@/services`), so their board,
 * match end and invite screen must use it (`gameTransportFor`,
 * `invitesFor`); every other online game and invite uses the Convex
 * server (`games` and `invites`, see `connection.ts`). A stopped dev game
 * stays one, so its match end still opens.
 *
 * No imports, so `test/afterEnv.ts` can reset it cheaply.
 */

const gameIds = new Set<string>();
const inviteCodes = new Set<string>();

/**
 * The dev game (`startDevGame`, an accepted dev invite) calls it for
 * each game on the in-memory server.
 */
export function rememberDevGame(gameId: string): void {
  gameIds.add(gameId);
}

/** Is `gameId` a dev game of this app run? */
export function isDevGame(gameId: string): boolean {
  return gameIds.has(gameId);
}

/** The dev invite (`startDevInvite`) calls it with its code (capital letters). */
export function rememberDevInvite(code: string): void {
  inviteCodes.add(code);
}

/** Is `code` (capital letters) a dev invite of this app run? */
export function isDevInvite(code: string): boolean {
  return inviteCodes.has(code);
}

/** Tests only: forgets the dev games and invites, like a new app run. `test/afterEnv.ts` calls it. */
export function forgetDevGamesForTest(): void {
  gameIds.clear();
  inviteCodes.clear();
}
