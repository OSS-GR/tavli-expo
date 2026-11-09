/**
 * The name one player sees for the other (#400, ADR-0008).
 *
 * A player with a username (#405, a saved account) is shown by it. Every
 * other player is shown as a guest: "Guest" and four random digits
 * ("Guest 4821"), made once on the server with the account and kept for
 * it. The digits are not unique, not picked by the player and not taken
 * from the phone; a new account gets a new number.
 *
 * The server sends the parts, not the text: the app writes "Guest 4821"
 * or "Επισκέπτης 4821" in the player's language.
 */

/** A guest name: the four digits only. */
export interface GuestName {
  readonly kind: 'guest';
  /** Four digits, `1000` to `9999` (`isGuestNumber`). */
  readonly number: string;
}

/** A username (#405): shown as the player typed it. */
export interface UsernameName {
  readonly kind: 'username';
  readonly name: string;
}

export type PlayerName = GuestName | UsernameName;

/** True for a guest number: four digits, not starting with 0. */
export function isGuestNumber(text: string): boolean {
  return /^[1-9][0-9]{3}$/.test(text);
}

/** The name of a guest with this number. */
export function guestName(number: string): GuestName {
  return { kind: 'guest', number };
}

/** The name of a player with this username. */
export function usernameName(name: string): UsernameName {
  return { kind: 'username', name };
}
