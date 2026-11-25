/**
 * Download my data (#445): `exportMyData` gives the signed-in caller a
 * copy of what this server keeps about them (`MyData` in
 * `@tavli/contracts`), as plain JSON, for the GDPR rights of access and
 * portability. Settings → Account → Download my data shares it.
 *
 * It is an action, so it can read tables with no cap (games, invites,
 * reports) in pages: each page is its own internal query, far below
 * Convex's read limits. The capped parts (the account, keys, rating,
 * friends, blocks, push tokens, seek) are one query, `exportHead`. The
 * pages run one after another, so a game that changes during the copy
 * may show its state before or after the change; nothing is missed that
 * existed for the whole copy. The shape and the order come from
 * `makeMyData` (`@tavli/online`), which the in-memory server runs too.
 *
 * What it covers is what the account delete deletes (`deleteAccountOf`
 * in `account.ts`): a new table or field that holds a player's data
 * goes here too. It never returns another player's id, a token, a code
 * or a secret: names as the caller sees them in the app, a push token as
 * its phone system and date, a key as its kind (with the address of an
 * email key, which Account shows the caller too). The friend requests,
 * the friend link token and the search times are left out: they are
 * working data of the friends screens, not a record about the player.
 * Like every public function it takes no player id. Never log the copy.
 */

import { ConvexError, v } from 'convex/values';
import type { PaginationResult } from 'convex/server';

import { MAX_BLOCKS, MAX_FRIENDS } from '@tavli/contracts';
import type {
  GameTransportErrorCode,
  MyData,
  MyDataAccount,
  MyDataBlock,
  MyDataFriend,
  MyDataGame,
  MyDataInvite,
  MyDataKey,
  MyDataPushToken,
  MyDataRankedSearch,
  MyDataRating,
  MyDataChatMessage,
  MyDataReport,
} from '@tavli/contracts';
import {
  loadFlow,
  makeMyData,
  myDataAccount,
  myDataGame,
  myDataInvite,
  myDataRating,
  summarizeGame,
} from '@tavli/online';

import { components, internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { action, internalQuery } from './_generated/server';
import { authComponent } from './auth';
import { signedInPlayer } from './caller';
import { gameInput } from './games';
import { toInviteRecord } from './invites';
import { isKeyProviderId } from './keyPlugin';
import { MAX_PUSH_TOKENS_PER_PLAYER } from './model/push';
import { nameOf, nameRowOf } from './playerNames';
import { ratingRow } from './ratings';
import { playerNamesSeenBy } from './safety';

/**
 * Games per page. One game reads its row and up to four name rows (the
 * names and the blocks of `playerNamesSeenBy`), and runs the engine once
 * to summarize it: 50 games stay far below Convex's limits.
 */
export const MY_DATA_GAMES_PAGE = 50;

/** Invites or reports per page: one read each. */
export const MY_DATA_ROWS_PAGE = 200;

/**
 * Better Auth `account` rows read for the keys. One user has one key per
 * provider (`claimKey`), so a few rows; the rest is room.
 */
const KEY_ROWS_READ = 20;

/** A page of a part of the copy, with the cursor of the next page. */
interface Page<T> {
  readonly items: T[];
  readonly cursor: string;
  readonly done: boolean;
}

function pageOf<D, T>(result: PaginationResult<D>, items: T[]): Page<T> {
  return { items, cursor: result.continueCursor, done: result.isDone };
}

/** The capped parts of the copy: one query. */
interface Head {
  readonly account: MyDataAccount;
  readonly rating: MyDataRating | null;
  readonly friends: MyDataFriend[];
  readonly blocks: MyDataBlock[];
  readonly pushTokens: MyDataPushToken[];
  readonly rankedSearch: MyDataRankedSearch | null;
  /** The chat switch (ADR-0011). The messages come in pages (`exportChatPage`). */
  readonly chatEnabled: boolean;
}

/** A Better Auth `account` row, as far as the keys need it. */
interface AccountRow {
  readonly providerId: string;
  readonly accountId: string;
  readonly createdAt: number;
}

/**
 * The capped parts for `playerId`, or `null` when the Better Auth user is
 * gone (a token outlives its deleted user, like in `existingPlayer`).
 */
export const exportHead = internalQuery({
  args: { playerId: v.string() },
  handler: async (ctx, { playerId }): Promise<Head | null> => {
    const user = await authComponent.getAnyUserById(ctx, playerId);
    if (user === null) return null;

    const accounts = (await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: 'account',
      where: [{ field: 'userId', value: playerId }],
      paginationOpts: { cursor: null, numItems: KEY_ROWS_READ },
    })) as { page: AccountRow[] };
    const keys = accounts.page.flatMap((row): MyDataKey[] => {
      const provider = row.providerId;
      if (!isKeyProviderId(provider)) return [];
      // The address of an email key: Account shows it to the caller too (#565).
      const email = provider === 'email' ? row.accountId : null;
      return [{ provider, email, addedAt: row.createdAt }];
    });

    const [names, rating, friendRows, blockRows, tokens, seek] = await Promise.all([
      nameRowOf(ctx, playerId),
      ratingRow(ctx, playerId),
      ctx.db
        .query('friends')
        .withIndex('by_player', (q) => q.eq('playerId', playerId))
        .take(MAX_FRIENDS),
      ctx.db
        .query('blocks')
        .withIndex('by_blocker', (q) => q.eq('blockerId', playerId))
        .take(MAX_BLOCKS),
      ctx.db
        .query('pushTokens')
        .withIndex('by_player', (q) => q.eq('playerId', playerId))
        // A new token drops the oldest past the cap; room for a moment over it.
        .take(MAX_PUSH_TOKENS_PER_PLAYER * 2),
      ctx.db
        .query('seeks')
        .withIndex('by_player', (q) => q.eq('playerId', playerId))
        .first(),
    ]);

    return {
      account: myDataAccount({
        saved: user.isAnonymous !== true,
        createdAt: user.createdAt,
        names,
        keys,
      }),
      rating: myDataRating(rating),
      // A friend's name, as on the Friends screen.
      friends: await Promise.all(
        friendRows.map(async (row) => ({
          name: await nameOf(ctx, row.friendId),
          since: row.since,
          wins: row.wins,
          losses: row.losses,
        })),
      ),
      // A blocked player's name, as on the Blocked players screen.
      blocks: await Promise.all(
        blockRows.map(async (row) => ({
          name: await nameOf(ctx, row.blockedId),
          blockedAt: row.createdAt,
        })),
      ),
      pushTokens: tokens.map((row) => ({ platform: row.platform, updatedAt: row.updatedAt })),
      rankedSearch:
        seek === null ? null : { game: seek.game, status: seek.status, since: seek.createdAt },
      chatEnabled: names?.chatOff !== true,
    };
  },
});

const pageArgs = { playerId: v.string(), cursor: v.union(v.string(), v.null()) };

/**
 * A page of the games where `playerId` plays `side`, with the names as
 * the caller sees them (`null` for a player they block, #320).
 */
export const exportGamesPage = internalQuery({
  args: { ...pageArgs, side: v.union(v.literal('white'), v.literal('black')) },
  handler: async (ctx, { playerId, cursor, side }): Promise<Page<MyDataGame>> => {
    const query =
      side === 'white'
        ? ctx.db.query('games').withIndex('by_white', (q) => q.eq('players.white', playerId))
        : ctx.db.query('games').withIndex('by_black', (q) => q.eq('players.black', playerId));
    const result = await query.paginate({ cursor, numItems: MY_DATA_GAMES_PAGE });
    const games = await Promise.all(
      result.page.map(async (game: Doc<'games'>) => {
        const names = await playerNamesSeenBy(ctx, playerId, game.players);
        const summary = summarizeGame(
          {
            ...gameInput(game),
            flow: loadFlow(game.flow),
            updatedAt: game.updatedAt ?? game._creationTime,
            names,
          },
          playerId,
        );
        return myDataGame(summary, game._creationTime);
      }),
    );
    return pageOf(result, games);
  },
});

/** A page of the invites `playerId` sent, any status. */
export const exportInvitesPage = internalQuery({
  args: { ...pageArgs, now: v.number() },
  handler: async (ctx, { playerId, cursor, now }): Promise<Page<MyDataInvite>> => {
    const result = await ctx.db
      .query('invites')
      .withIndex('by_from', (q) => q.eq('from', playerId))
      .paginate({ cursor, numItems: MY_DATA_ROWS_PAGE });
    return pageOf(
      result,
      result.page.map((doc) => myDataInvite(toInviteRecord(doc), doc._creationTime, now)),
    );
  },
});

/** A page of the chat messages `playerId` wrote that are still kept (ADR-0011). Never the other player's. */
export const exportChatPage = internalQuery({
  args: pageArgs,
  handler: async (ctx, { playerId, cursor }): Promise<Page<MyDataChatMessage>> => {
    const result = await ctx.db
      .query('chatMessages')
      .withIndex('by_sender', (q) => q.eq('senderId', playerId))
      .paginate({ cursor, numItems: MY_DATA_ROWS_PAGE });
    return pageOf(
      result,
      result.page.map((row) => ({ gameId: row.gameId, text: row.text, sentAt: row.sentAt })),
    );
  },
});

/** A page of the reports `playerId` made that are still kept. */
export const exportReportsPage = internalQuery({
  args: pageArgs,
  handler: async (ctx, { playerId, cursor }): Promise<Page<MyDataReport>> => {
    const result = await ctx.db
      .query('reports')
      .withIndex('by_reporter', (q) => q.eq('reporterId', playerId))
      .paginate({ cursor, numItems: MY_DATA_ROWS_PAGE });
    return pageOf(
      result,
      result.page.map((row) => ({
        reason: row.reason,
        username: row.username ?? null,
        reportedAt: row.createdAt,
      })),
    );
  },
});

/** Reads every page of a part, one after another. */
async function allPages<T>(read: (cursor: string | null) => Promise<Page<T>>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page: Page<T> = await read(cursor);
    items.push(...page.items);
    if (page.done) return items;
    cursor = page.cursor;
  }
}

function fail(code: GameTransportErrorCode, message: string): never {
  // A plain object literal, so it fits Convex's `Value` type.
  const data: { code: GameTransportErrorCode; message: string } = { code, message };
  throw new ConvexError(data);
}

/**
 * The caller's copy (see the top of this file). Without a sign-in, or
 * once the account is deleted, it throws `NOT_SIGNED_IN`.
 */
export const exportMyData = action({
  args: {},
  handler: async (ctx): Promise<MyData> => {
    const playerId = await signedInPlayer(ctx);
    const head: Head | null = await ctx.runQuery(internal.myData.exportHead, { playerId });
    if (head === null) fail('NOT_SIGNED_IN', 'this account does not exist');
    const now = Date.now();
    const { chatEnabled, ...rest } = head;
    const [asWhite, asBlack, invites, reports, chatMessages] = await Promise.all([
      allPages((cursor) =>
        ctx.runQuery(internal.myData.exportGamesPage, { playerId, cursor, side: 'white' }),
      ),
      allPages((cursor) =>
        ctx.runQuery(internal.myData.exportGamesPage, { playerId, cursor, side: 'black' }),
      ),
      allPages((cursor) =>
        ctx.runQuery(internal.myData.exportInvitesPage, { playerId, cursor, now }),
      ),
      allPages((cursor) => ctx.runQuery(internal.myData.exportReportsPage, { playerId, cursor })),
      allPages((cursor) => ctx.runQuery(internal.myData.exportChatPage, { playerId, cursor })),
    ]);
    return makeMyData({
      madeAt: now,
      ...rest,
      games: [...asWhite, ...asBlack],
      invites,
      reports,
      chat: { enabled: chatEnabled, messages: chatMessages },
    });
  },
});
