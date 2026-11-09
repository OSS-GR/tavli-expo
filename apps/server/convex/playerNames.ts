/**
 * Guest names (#400, ADR-0008): each player's four random digits, shown
 * to the other player as "Guest 4821".
 *
 * A player gets a number the first time they make an invite
 * (`createInvite`) or start a game (`insertGame`, both players), and keeps
 * it. Every online player goes through one of those, so views, lists and
 * invites can name them. The digits come from `createCryptoRng`, never
 * from the phone, and are not unique. `deleteAccountOf` deletes the row,
 * so a new account gets a new number. The pure parts are `pickGuestNumber`
 * and `namesOf` in `@tavli/online`.
 *
 * This file has no public function: the calls above use these helpers.
 */

import { guestName } from '@tavli/contracts';
import type { PlayerName } from '@tavli/contracts';
import type { PerPlayer } from '@tavli/engine';
import { pickGuestNumber } from '@tavli/online';

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

/** The name of `playerId`, or `null` when they have no number (a deleted account). */
export async function nameOf(ctx: QueryCtx, playerId: string): Promise<PlayerName | null> {
  const row = await rowOf(ctx, playerId);
  return row === null ? null : guestName(row.guestNumber);
}

/** The name of each side. */
export async function namesOfPlayers(
  ctx: QueryCtx,
  players: PerPlayer<string>,
): Promise<PerPlayer<PlayerName | null>> {
  const [white, black] = await Promise.all([
    nameOf(ctx, players.white),
    nameOf(ctx, players.black),
  ]);
  return { white, black };
}

/** Deletes the number of `playerId` (account delete). */
export async function deleteGuestNumberOf(ctx: MutationCtx, playerId: string): Promise<void> {
  const row = await rowOf(ctx, playerId);
  if (row !== null) await ctx.db.delete(row._id);
}
