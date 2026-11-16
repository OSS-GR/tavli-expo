/**
 * What Home's hero card shows (#517, Figma 01d): your most important game.
 *
 * In this order:
 * 1. `turn`: an online game that waits for you. With more than one, the
 *    one whose turn runs out first.
 * 2. `invite`: an open friend invite to you (#486). With more than one,
 *    the one that ends first.
 * 3. `waiting`: an online game that waits for the other player. The game
 *    with a friend still comes first, also while you wait (owner,
 *    2026-11-15).
 * 4. `saved`: the saved game on this phone ("Continue game").
 * 5. `ranked`: Play ranked, for a player whose last matches were ranked
 *    (`lastModes.ts`).
 * 6. `bot`: Play vs bot.
 *
 * Pure: the lists come from the server through Home's hooks.
 */
import type { GameSummary, InviteView } from '@tavli/contracts';

export type HeroPick =
  | { readonly kind: 'turn'; readonly game: GameSummary }
  | { readonly kind: 'invite'; readonly invite: InviteView }
  | { readonly kind: 'waiting'; readonly game: GameSummary }
  | { readonly kind: 'saved' }
  | { readonly kind: 'ranked' }
  | { readonly kind: 'bot' };

export interface HeroInputs {
  /** The active online games, in the server's order (newest change first). */
  readonly games: readonly GameSummary[];
  /** The open friend invites to the player. */
  readonly friendInvites: readonly InviteView[];
  /** A saved game on this phone. */
  readonly hasSave: boolean;
  /** Offer Play ranked: the last matches were ranked and ranked play is on. */
  readonly rankedRegular: boolean;
}

/** A turn with no timer runs out last. */
function deadline(game: GameSummary): number {
  return game.turnDeadline ?? Number.POSITIVE_INFINITY;
}

/** The first item with the smallest key; the order breaks ties. */
function first<T>(items: readonly T[], key: (item: T) => number): T | undefined {
  let best: T | undefined;
  for (const item of items) {
    if (best === undefined || key(item) < key(best)) best = item;
  }
  return best;
}

export function pickHero({ games, friendInvites, hasSave, rankedRegular }: HeroInputs): HeroPick {
  const turn = first(
    games.filter((game) => game.myTurn),
    deadline,
  );
  if (turn) return { kind: 'turn', game: turn };
  const invite = first(friendInvites, (item) => item.expiresAt);
  if (invite) return { kind: 'invite', invite };
  const waiting = games.find((game) => !game.myTurn);
  if (waiting) return { kind: 'waiting', game: waiting };
  if (hasSave) return { kind: 'saved' };
  if (rankedRegular) return { kind: 'ranked' };
  return { kind: 'bot' };
}

/** The online game in the hero, if any: the list leaves it out. */
export function heroGameId(pick: HeroPick): string | null {
  return pick.kind === 'turn' || pick.kind === 'waiting' ? pick.game.gameId : null;
}
