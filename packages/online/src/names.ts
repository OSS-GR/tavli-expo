/**
 * Player names (#400, #405, ADR-0008). A username (a saved account,
 * `usernames.ts`) wins; else the guest name: "Guest" and four random digits, made once
 * on the server for each account and kept for it. Both servers use this:
 * the Convex functions (`apps/server/convex/playerNames.ts`) and the
 * in-memory server. The digits come from the server's RNG (Convex:
 * `createCryptoRng`), never from the phone.
 *
 * Everything here is pure.
 */

import { guestName, usernameName } from '@tavli/contracts';
import type { PlayerName } from '@tavli/contracts';
import type { PerPlayer, Rng } from '@tavli/engine';

/** The lowest guest number. The numbers never start with 0. */
const FIRST = 1000;
/** How many guest numbers there are: 1000 to 9999. */
const COUNT = 9000;
/** The uint32 values below this limit map to each number the same number of times. */
const FAIR_LIMIT = 2 ** 32 - (2 ** 32 % COUNT);

/** A new guest number: four digits, 1000 to 9999, each as likely. Not unique. */
export function pickGuestNumber(rng: Rng): string {
  for (;;) {
    const value = rng.nextUint32();
    if (value < FAIR_LIMIT) return String(FIRST + (value % COUNT));
  }
}

/** What a server keeps for a player's name. */
export interface NameRecord {
  readonly guestNumber?: string;
  readonly username?: string;
}

/** The name of a player: the username, else the guest name, else `null` (none kept). */
export function nameFrom(record: NameRecord | null): PlayerName | null {
  if (record?.username !== undefined) return usernameName(record.username);
  if (record?.guestNumber !== undefined) return guestName(record.guestNumber);
  return null;
}

/** The name of each side (`nameFrom`). */
export function namesOf(records: PerPlayer<NameRecord | null>): PerPlayer<PlayerName | null> {
  return { white: nameFrom(records.white), black: nameFrom(records.black) };
}

/** No names: for a view whose server keeps none. */
export const NO_NAMES: PerPlayer<PlayerName | null> = { white: null, black: null };
