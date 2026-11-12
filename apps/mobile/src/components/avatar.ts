/**
 * The pure parts of a checker avatar (#495): which wood a player gets and
 * the initials of a name. No React here, so plain tests can run them.
 */
import type { AvatarWood } from '@tavli/ui';

export const AVATAR_WOODS: readonly AvatarWood[] = ['bone', 'maple', 'walnut', 'ebony'];

/**
 * The wood for a player, from a hash (FNV-1a) of their id: the same player
 * gets the same wood on every phone and in every list.
 */
export function avatarWood(key: string): AvatarWood {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return AVATAR_WOODS[(hash >>> 0) % AVATAR_WOODS.length]!;
}

/**
 * Up to two initials from a name: the first letter of the first two words
 * ("eleni.k" → "EK", "nikos_k" → "NK", "Anna" → "A"). Words split at
 * anything that is not a letter or a digit. A word that starts with a digit
 * gives no initial ("Guest 4821" → "G"). Greek works too ("Ελένη" → "Ε").
 */
export function initialsOf(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 0);
  const letters = words
    .slice(0, 2)
    .map((word) => Array.from(word)[0]!)
    .filter((letter) => /\p{L}/u.test(letter));
  return letters.join('').toLocaleUpperCase();
}
