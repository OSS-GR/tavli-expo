/**
 * Player profiles (#317): a username that the other player sees.
 *
 * A player picks a username once they play online. The other player of
 * a game sees it (`OnlineGameView.opponentName`, `GameSummary.opponentName`),
 * and so does a friend who opens an invite (`InviteView.fromName`). Later,
 * friends find each other by username (owner answer Q10).
 *
 * The rules of a username (owner answer, 2026-10-28): 3 to 20 characters
 * (code points after NFC) of Latin letters, Greek letters (with or
 * without accents, final ς), `0`–`9` and `_`. One script per name: Latin
 * or Greek letters, not both. Unique by `usernameKey` (no accents, any
 * case, ς = σ, Greek look-alikes folded to Latin). `checkUsername` in
 * `@tavli/online` checks them.
 * Every type here is plain JSON. See "Profiles" in
 * `docs/architecture/online-game-service.md`.
 */

/** The fewest characters in a username. */
export const USERNAME_MIN_LENGTH = 3;

/** The most characters in a username. */
export const USERNAME_MAX_LENGTH = 20;

/** What a player may see of their own profile. */
export interface Profile {
  /** The username as the player typed it (its case kept). */
  readonly username: string;
}

/** Why the server rejected a profile call. */
export const PROFILE_ERROR_CODES = [
  /**
   * The username breaks the rules: 3 to 20 characters, only Latin or
   * Greek letters (not both in one name), `0`–`9` and `_`.
   */
  'USERNAME_INVALID',
  /**
   * Another player has this username, in any case (`Maria` and `maria`
   * are the same name), or the name is kept for the app (such as `admin`).
   */
  'USERNAME_TAKEN',
  /** Bad arguments. */
  'BAD_REQUEST',
  /** The call has no signed-in user (the same code as in `GAME_TRANSPORT_ERROR_CODES`). */
  'NOT_SIGNED_IN',
] as const;

export type ProfileErrorCode = (typeof PROFILE_ERROR_CODES)[number];

/** The data of a rejected profile call. */
export interface ProfileErrorData {
  readonly code: ProfileErrorCode;
  readonly message: string;
}

export function isProfileErrorData(value: unknown): value is ProfileErrorData {
  if (typeof value !== 'object' || value === null) return false;
  const { code, message } = value as { code?: unknown; message?: unknown };
  return (
    typeof message === 'string' &&
    typeof code === 'string' &&
    (PROFILE_ERROR_CODES as readonly string[]).includes(code)
  );
}

/**
 * The profile port (#317): the caller's own profile. The adapter knows
 * who the caller is (the signed-in user), as in `GameTransport`, so no
 * call carries a player id. Other players' names come with the game and
 * invite views, not from here.
 *
 * It is its own port, not part of `GameTransport` or `Invites`: a profile
 * belongs to the player, not to one game or invite, and adding friends by
 * username (later) builds on it.
 *
 * Adapters: the in-memory server (`createMemoryGameServer` in
 * `@tavli/online`) and the Convex client (`createConvexProfiles` in
 * `@tavli/backend-convex`). The contract checks are `profilesContract` in
 * `@tavli/contracts/testing`.
 */
export interface Profiles {
  /** The caller's profile, or `null` when they have not picked a username yet. */
  getMyProfile(): Promise<Profile | null>;
  /**
   * Sets the caller's username. Spaces at the ends are dropped. Resolves
   * with the saved profile. The caller may change their name at any time,
   * also to another case of the same name (`maria` → `Maria`); the old
   * name is free again at once. Rejects with `ProfileErrorData`:
   * `USERNAME_INVALID`, `USERNAME_TAKEN`, or `NOT_SIGNED_IN` with no
   * sign-in (or once the account is deleted).
   */
  setMyUsername(username: string): Promise<Profile>;
}
