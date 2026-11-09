/**
 * Guest names (#400, ADR-0008): "Guest" and four random digits, made once
 * on the server for each account and kept for it. Both servers use this:
 * the Convex functions (`apps/server/convex/playerNames.ts`) and the
 * in-memory server. The digits come from the server's RNG (Convex:
 * `createCryptoRng`), never from the phone.
 *
 * Everything here is pure.
 */

import { guestName } from '@tavli/contracts';
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

/** The name of each side from the saved guest numbers (`null` where a side has none). */
export function namesOf(numbers: PerPlayer<string | null>): PerPlayer<PlayerName | null> {
  return {
    white: numbers.white === null ? null : guestName(numbers.white),
    black: numbers.black === null ? null : guestName(numbers.black),
  };
}

/** No names: for a view whose server keeps none. */
export const NO_NAMES: PerPlayer<PlayerName | null> = { white: null, black: null };
