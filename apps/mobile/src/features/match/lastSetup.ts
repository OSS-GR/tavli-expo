/**
 * The new-game screen remembers the last choices per mode (wireframe 4).
 * Saved as JSON through the `Storage` port. Bad data gives the defaults.
 */
import type { Difficulty, Storage } from '@tavli/contracts';

import { sanitizeSetup, type MatchMode, type MatchSetup } from './setup';

export function lastSetupKey(mode: MatchMode): string {
  return `newGame.${mode}`;
}

export function loadLastSetup(
  storage: Storage,
  mode: MatchMode,
  levels: readonly Difficulty[],
): MatchSetup {
  const text = storage.getString(lastSetupKey(mode));
  let raw: unknown = null;
  if (text !== undefined) {
    try {
      raw = JSON.parse(text);
    } catch {
      raw = null;
    }
  }
  return sanitizeSetup(raw, mode, levels);
}

export function saveLastSetup(storage: Storage, setup: MatchSetup): void {
  storage.setString(lastSetupKey(setup.mode), JSON.stringify(setup));
}
