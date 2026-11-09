/**
 * Usernames (#405, ADR-0008): one name per saved account, picked by the
 * player and shown to other players in games, invites and lists.
 *
 * - Only a saved account (one with a sign-in key, `AuthUser.isGuest` is
 *   `false`) may pick one. A guest keeps the guest name ("Guest 4821").
 * - The rules of a name (`checkUsername` in `@tavli/online`): 3 to 16
 *   characters, Latin or Greek letters, digits and `_`, a letter first,
 *   and one alphabet per name. Names are unique ignoring case, accents and
 *   letters that look the same ("Αlex" with a Greek Α is "alex"). The
 *   name is shown as the player typed it.
 * - The first pick is free. After that a player may change the name once
 *   in `USERNAME_CHANGE_MS` (30 days). A name the player drops is free for
 *   others at once.
 * - The username step also accepts the terms of use (`TERMS_VERSION`) and
 *   asks once that the player is old enough. The server keeps only that
 *   the age was checked, and when; never an age or a birth date.
 *
 * Like the other ports, no call takes a player id: the server reads the
 * caller from the sign-in. The Convex adapter is `createConvexUsernames`
 * (`@tavli/backend-convex`); the in-memory server (`@tavli/online`) has
 * `usernamesFor(caller)`. The contract checks are `usernamesContract` in
 * `@tavli/contracts/testing`.
 */

/** The fewest characters in a username. */
export const USERNAME_MIN_LENGTH = 3;
/** The most characters in a username. */
export const USERNAME_MAX_LENGTH = 16;
/** A player may change their username once in this time (30 days). The first pick is free. */
export const USERNAME_CHANGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The version of the terms of use (`docs/legal/terms.md`). Raise it when
 * the terms change so much that players must accept them again: the next
 * username change then asks again.
 */
export const TERMS_VERSION = '2026-11-09';

/** The signed-in player's username and what the username step still needs. */
export interface MyUsername {
  /** `false` for a guest: a guest may not pick a username. */
  readonly saved: boolean;
  /** The username, as the player typed it, or `null` when they have none. */
  readonly name: string | null;
  /**
   * When the player may change the name again (ms since 1970), or `null`
   * when they may now: no name yet, or the first pick not changed yet.
   */
  readonly nextChangeAt: number | null;
  /** The player said once that they are old enough. Ask only when this is `false`. */
  readonly ageChecked: boolean;
  /** The terms version the player accepted, or `null`. Ask when it is not `TERMS_VERSION`. */
  readonly termsVersion: string | null;
  /**
   * The four digits of the guest name ("Guest 4821", #400, #402), or
   * `null` while the account has none: the server makes it at the first
   * invite, game or username.
   */
  readonly guestNumber: string | null;
}

/** A new username, with the answers of the username step. */
export interface SetUsernameRequest {
  /** The name as typed (the app trims spaces first). */
  readonly name: string;
  /** `TERMS_VERSION` when the player ticked the terms box now. Needed while `MyUsername.termsVersion` is not `TERMS_VERSION`. */
  readonly acceptTerms?: string;
  /** `true` when the player ticked the age box now. Needed while `MyUsername.ageChecked` is `false`. */
  readonly ageChecked?: boolean;
}

export const USERNAME_ERROR_CODES = [
  /** No valid sign-in. */
  'NOT_SIGNED_IN',
  /** A guest: save the account with a key first. */
  'NOT_SAVED',
  /** The name breaks the rules (`checkUsername`). */
  'BAD_NAME',
  /** A reserved name or a word we do not allow. */
  'NOT_ALLOWED',
  /** Another player has this name (ignoring case, accents and look-alikes). */
  'TAKEN',
  /** The last change was less than 30 days ago. */
  'TOO_SOON',
  /** The terms of use are not accepted. */
  'TERMS_NEEDED',
  /** The age is not checked. */
  'AGE_NEEDED',
] as const;

export type UsernameErrorCode = (typeof USERNAME_ERROR_CODES)[number];

/** The data of a rejected call. */
export interface UsernameErrorData {
  readonly code: UsernameErrorCode;
  readonly message: string;
}

export function isUsernameErrorData(value: unknown): value is UsernameErrorData {
  if (typeof value !== 'object' || value === null) return false;
  const { code, message } = value as { code?: unknown; message?: unknown };
  return (
    typeof message === 'string' &&
    typeof code === 'string' &&
    (USERNAME_ERROR_CODES as readonly string[]).includes(code)
  );
}

export interface Usernames {
  /** The signed-in player's username. Rejects with `NOT_SIGNED_IN` with nobody signed in. */
  mine(): Promise<MyUsername>;
  /**
   * Picks or changes the signed-in player's username. Resolves with the
   * new state. Rejects with `UsernameErrorData` (see the codes above).
   * The same text as now changes nothing and is no change.
   */
  setMine(request: SetUsernameRequest): Promise<MyUsername>;
}
