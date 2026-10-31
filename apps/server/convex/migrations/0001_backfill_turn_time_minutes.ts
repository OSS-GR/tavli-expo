/**
 * Migration (#183): the `pace` → `turnTimeMinutes` rename. Old rows still
 * hold the removed `pace` field and lack `turnTimeMinutes`, so any write
 * to them would fail schema validation. The dev deployment's data is
 * throwaway, so this wipes the two tables instead of backfilling:
 * players see the games gone, which is fine before the feature ships.
 *
 * Run on the dev deployment after the schema deploys (the field is
 * optional while old rows exist):
 *
 *   npx convex run migrations/0001_backfill_turn_time_minutes
 */
import { v } from 'convex/values';

import { internalMutation } from '../_generated/server';

export const migrate = internalMutation({
  args: {},
  returns: v.object({ games: v.number(), invites: v.number() }),
  handler: async (ctx) => {
    let games = 0;
    let invites = 0;
    for (const row of await ctx.db.query('games').collect()) {
      await ctx.db.delete(row._id);
      games += 1;
    }
    for (const row of await ctx.db.query('invites').collect()) {
      await ctx.db.delete(row._id);
      invites += 1;
    }
    return { games, invites };
  },
});
