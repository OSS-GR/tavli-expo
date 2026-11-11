/**
 * The friends Play a friend shows (#488): a short list, the friends you
 * played most first, then the newest friends.
 */
import type { Friend } from '@tavli/contracts';

/** How many friends Play a friend shows. The rest are on the Friends screen. */
export const FRIENDS_SHOWN = 5;

/** Up to `count` friends: most matches played first, then the newest friend. */
export function pickFriends(friends: readonly Friend[], count = FRIENDS_SHOWN): Friend[] {
  const played = (f: Friend) => f.record.wins + f.record.losses;
  return [...friends].sort((a, b) => played(b) - played(a) || b.since - a.since).slice(0, count);
}
