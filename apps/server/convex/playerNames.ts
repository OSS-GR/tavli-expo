/**
 * Guest names (#400, ADR-0008): each player's four random digits, shown
 * to the other player as "Guest 4821".
 *
 * A player gets a number the first time they make an invite
 * (`createInvite`) or start a game (`insertGame`, both players), and keeps
 * it. A player who made their invites and games before #400 has no number
 * until their next one: until then their views say `null`, and the app
 * says "Opponent" or "your friend". No query writes, so none can make one. The digits come from `createCryptoRng`, never
 * from the phone, and are not unique. `deleteAccountOf` deletes the row,
 * so a new account gets a new number. The pure parts are `pickGuestNumber`
 * and `namesOf` in `@tavli/online`.
 *
 * This file has no public function: the calls above use these helpers.
 */

import { guestName } from '@tavli/contracts';
import type { PlayerName } from '@tavli/contracts';
import type { PerPlayer } from '@tavli/engine';
import { namesOf, pickGuestNumber } from '@tavli/online';

import type { MutationCtx, QueryCtx } from './_generated/server';
import { createCryptoRng } from './model/cryptoRng';

async function rowOf(ctx: QueryCtx, playerId: string) {
  return await ctx.db
    .query('playerNames')
    .withIndex('by_player', (q) => q.eq('playerId', playerId))
    .first();
}

/** Gives `playerId` a guest number, unless they have one. */
export async function ensureGuestNumber(ctx: MutationCtx, playerId: string): Promise<void> {
  if ((await rowOf(ctx, playerId)) !== null) return;
  await ctx.db.insert('playerNames', { playerId, guestNumber: pickGuestNumber(createCryptoRng()) });
}

async function numberOf(ctx: QueryCtx, playerId: string): Promise<string | null> {
  return (await rowOf(ctx, playerId))?.guestNumber ?? null;
}

/** The name of each side (`null` for a side with no number). */
export async function namesOfPlayers(
  ctx: QueryCtx,
  players: PerPlayer<string>,
): Promise<PerPlayer<PlayerName | null>> {
  const [white, black] = await Promise.all([
    numberOf(ctx, players.white),
    numberOf(ctx, players.black),
  ]);
  return namesOf({ white, black });
}

/** The name of `playerId`, or `null` when they have no number (an old or deleted account). */
export async function nameOf(ctx: QueryCtx, playerId: string): Promise<PlayerName | null> {
  const number = await numberOf(ctx, playerId);
  return number === null ? null : guestName(number);
}

/** Deletes the number of `playerId` (account delete). */
export async function deleteGuestNumberOf(ctx: MutationCtx, playerId: string): Promise<void> {
  const row = await rowOf(ctx, playerId);
  if (row !== null) await ctx.db.delete(row._id);
}
