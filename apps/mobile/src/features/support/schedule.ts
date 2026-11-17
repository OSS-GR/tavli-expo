/**
 * When the end screen asks "Enjoying Tavlaki?" (#590). Pure: every call
 * takes the time.
 *
 * - Only finished games count: against the computer, pass-and-play, or a
 *   Play ranked match (all its games, counted at the match end). The
 *   tutorial and online friend games never count.
 * - The first ask comes after the 2nd finished game (`FIRST_ASK_GAMES`),
 *   then after every 10 more (`NEXT_ASK_GAMES`), and at most once every
 *   7 days (`ASK_GAP_MS`).
 * - Never after a lost game (or a draw): a due ask waits for the next
 *   game the player wins, and the lost game does not use it up
 *   (`mayShow` false).
 * - The ask starts the count again. "Not now" does too (`notNow`), so the
 *   next ask is 10 games later. "Don't ask again" stops it for good
 *   (`stop`); Settings keeps its row.
 * - A clock that moved back never brings an ask early: the 7 days count
 *   from the saved time, so an earlier "now" only waits longer.
 *
 * The state is kept only on the phone (`supportAsk.ts`): never on the
 * server, never in analytics.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The first ask comes after this many finished games. */
export const FIRST_ASK_GAMES = 2;

/** Each later ask comes after this many more finished games. */
export const NEXT_ASK_GAMES = 10;

/** At most one ask in this time. */
export const ASK_GAP_MS = 7 * DAY_MS;

export interface SupportAskState {
  /** Finished games since the last ask (or since the start). */
  readonly games: number;
  /** True once the first ask showed. */
  readonly asked: boolean;
  /** The time of the last ask, or `null` before the first. */
  readonly lastAskAt: number | null;
  /** "Don't ask again": no more asks. */
  readonly stopped: boolean;
}

export const NEW_SUPPORT_ASK: SupportAskState = {
  games: 0,
  asked: false,
  lastAskAt: null,
  stopped: false,
};

/** True when an ask is due now (the next finished game the player wins shows it). */
export function askDue(state: SupportAskState, now: number): boolean {
  if (state.stopped) return false;
  const needed = state.asked ? NEXT_ASK_GAMES : FIRST_ASK_GAMES;
  if (state.games < needed) return false;
  return state.lastAskAt === null || now >= state.lastAskAt + ASK_GAP_MS;
}

export interface CountedGames {
  readonly state: SupportAskState;
  /** True when the card shows now. */
  readonly ask: boolean;
}

/**
 * Counts `count` finished games. The card shows when an ask is due and
 * `mayShow` (the player won, and no other card showed today); showing
 * starts the count again.
 */
export function countGames(
  state: SupportAskState,
  { count, mayShow, now }: { count: number; mayShow: boolean; now: number },
): CountedGames {
  if (state.stopped || count <= 0) return { state, ask: false };
  const counted = { ...state, games: state.games + count };
  if (!mayShow || !askDue(counted, now)) return { state: counted, ask: false };
  return { state: { ...counted, games: 0, asked: true, lastAskAt: now }, ask: true };
}

/** "Not now": the next ask is `NEXT_ASK_GAMES` games later. */
export function notNow(state: SupportAskState): SupportAskState {
  return state.games === 0 ? state : { ...state, games: 0 };
}

/** "Don't ask again". */
export function stop(state: SupportAskState): SupportAskState {
  return state.stopped ? state : { ...state, stopped: true };
}

/** Reads a saved state. Anything broken reads as a new phone. */
export function parseSupportAsk(text: string | undefined): SupportAskState {
  if (text === undefined) return NEW_SUPPORT_ASK;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) return NEW_SUPPORT_ASK;
    const { games, asked, lastAskAt, stopped } = value as Record<string, unknown>;
    return {
      games: typeof games === 'number' && Number.isFinite(games) && games >= 0 ? games : 0,
      asked: asked === true,
      lastAskAt: typeof lastAskAt === 'number' && Number.isFinite(lastAskAt) ? lastAskAt : null,
      stopped: stopped === true,
    };
  } catch {
    return NEW_SUPPORT_ASK;
  }
}
