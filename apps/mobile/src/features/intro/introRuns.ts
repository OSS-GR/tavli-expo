/**
 * When the table scene (#509) plays. Home plays it the first time Home
 * shows in an app run; the game screen plays it once per match, when the
 * match opens (never on a rematch). This keeps what played in memory for
 * the app run. It saves nothing.
 *
 * A rematch keeps its store but gets a new `matchKey`, and the app shows it
 * on a new screen. So a match counts as played when its key or its store
 * played: the store catches a rematch, the key an online game whose screen
 * builds a new store each time it opens.
 *
 * Read with the `…Due` functions when a screen mounts, and mark it played
 * in an effect (React may run a state initializer twice).
 */

/** The newest matches kept: far more than one app run opens. */
const KEPT_MATCHES = 50;

let homePlayed = false;
let matchesPlayed: readonly string[] = [];
let storesPlayed = new WeakSet<object>();
/** Tests: game start plays no intro unless a test turns it on. */
let matchIntros = true;

/** True until Home has played the scene in this app run. */
export function homeIntroDue(): boolean {
  return !homePlayed;
}

export function markHomeIntroPlayed(): void {
  homePlayed = true;
}

/**
 * True when neither the match with this key (the store's `matchKey`) nor
 * its store has played the scene.
 */
export function matchIntroDue(matchKey: string, store: object): boolean {
  return matchIntros && !matchesPlayed.includes(matchKey) && !storesPlayed.has(store);
}

export function markMatchIntroPlayed(matchKey: string, store: object): void {
  storesPlayed.add(store);
  if (matchesPlayed.includes(matchKey)) return;
  matchesPlayed = [...matchesPlayed, matchKey].slice(-KEPT_MATCHES);
}

/**
 * Tests (`test/afterEnv.ts`): Home rests on the last frame and game start
 * plays no intro, so a test can tap the opening card at once. A test of
 * the intro passes `{ home: true }` or `{ matches: true }`.
 */
export function resetIntrosForTest({
  home = false,
  matches = false,
}: { home?: boolean; matches?: boolean } = {}): void {
  homePlayed = !home;
  matchesPlayed = [];
  storesPlayed = new WeakSet();
  matchIntros = matches;
}
