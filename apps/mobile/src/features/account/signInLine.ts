/**
 * How a saved account signs in, in one line (#561, Figma frame 19): "Signed
 * in with email", "… with Apple", "… with Apple and email". The Settings
 * card and the Account header both show it, in place of "Saved account":
 * players sign in, they never "save".
 */
import type { AuthKeyProvider } from '@tavli/contracts';

import type { IconName } from '@/components/icons';

export type SignInLine = 'apple' | 'email' | 'both' | 'none';

/** Which line fits the account's keys. `none`: the keys did not load. */
export function signInLine(keys: readonly AuthKeyProvider[] | null): SignInLine {
  if (keys === null) return 'none';
  const apple = keys.includes('apple');
  const email = keys.includes('email');
  if (apple && email) return 'both';
  if (apple) return 'apple';
  if (email) return 'email';
  return 'none';
}

/** The icon next to the line: the envelope for email alone, else the key. */
export function signInIcon(line: SignInLine): IconName {
  return line === 'email' ? 'mail' : 'keyRound';
}
