/**
 * What the phone saw when a ranked match started (#532): your rating then,
 * for "Rating 1490 → 1503" at the match end. Kept in memory for the app
 * run only, by game id; after a restart the match end shows the new
 * rating alone. Never saved and never sent anywhere.
 */
const starts = new Map<string, number>();

/** Notes your rating when the match `gameId` started. */
export function rememberRankedStart(gameId: string, rating: number): void {
  starts.set(gameId, rating);
}

/** Your rating when the match `gameId` started, if this app run saw it. */
export function rankedStartRating(gameId: string): number | null {
  return starts.get(gameId) ?? null;
}

export function forgetRankedStartsForTest(): void {
  starts.clear();
}
