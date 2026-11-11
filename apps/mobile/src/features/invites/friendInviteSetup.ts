/**
 * The last setup of a friend invite (#488): the game, the match length and
 * the turn time limit. Every friend invite that the server made saves it,
 * from Play a friend's friends list or from the full setup. The Friends
 * screen's Invite sends it again after a short confirm, and the full setup
 * of a friend invite starts from it.
 *
 * Saved as JSON through the `Storage` port, on the phone only. It holds no
 * id and no name. Bad or missing data gives `null`: Invite then opens the
 * full setup.
 */
import { ONLINE_GAME_CHOICES, type NewInvite, type Storage } from '@tavli/contracts';

import { MATCH_LENGTHS } from '@/features/match/setup';
import { storage as appStorage } from '@/services';

export const FRIEND_INVITE_SETUP_KEY = 'friendInvite.lastSetup';

/** The turn time limit options: null is the 24-hour default, others are minutes. */
export const TURN_TIME_LIMITS: readonly (number | null)[] = [null, 5, 1];

/** The saved setup, or `null` when there is none or it does not read. */
export function loadFriendInviteSetup(storage: Storage = appStorage): NewInvite | null {
  let raw: unknown;
  try {
    const text = storage.getString(FRIEND_INVITE_SETUP_KEY);
    if (text === undefined) return null;
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  return readSetup(raw);
}

/** Saves the setup of a friend invite the server just made. A failed save only loses the shortcut. */
export function saveFriendInviteSetup(game: NewInvite, storage: Storage = appStorage): void {
  const setup: NewInvite = {
    choice: game.choice,
    targetPoints: game.targetPoints,
    turnTimeMinutes: game.turnTimeMinutes,
  };
  try {
    storage.setString(FRIEND_INVITE_SETUP_KEY, JSON.stringify(setup));
  } catch {
    // Only a shortcut: Invite opens the full setup.
  }
}

function readSetup(raw: unknown): NewInvite | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { choice, targetPoints, turnTimeMinutes } = raw as Record<string, unknown>;
  if (!ONLINE_GAME_CHOICES.some((c) => c === choice)) return null;
  if (!MATCH_LENGTHS.some((n) => n === targetPoints)) return null;
  if (!TURN_TIME_LIMITS.some((m) => m === turnTimeMinutes)) return null;
  return {
    choice: choice as NewInvite['choice'],
    targetPoints: targetPoints as number,
    turnTimeMinutes: turnTimeMinutes as number | null,
  };
}
