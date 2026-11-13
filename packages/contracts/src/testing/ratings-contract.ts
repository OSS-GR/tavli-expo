/**
 * The `Ratings` port contract (#407), as plain async checks that work in
 * any test runner (Vitest in packages, Jest in the app).
 *
 *   for (const check of ratingsContract()) {
 *     it(check.name, () => check.run(makeSubject()));
 *   }
 *
 * Make a new subject for each check: three players with saved accounts
 * (`alice`, `bob`, `carol`) and one guest, on one server, with no rated
 * match and no username. The server clock stays in one UTC day for the
 * whole check. A check rejects with an `Error` when the adapter breaks
 * the contract. The checks never wait on a real clock.
 *
 * The next day's count and the board's row cap need a clock or many
 * players, so each server tests them on its own.
 */
import type { Friends } from '../friends';
import type { GameTransport } from '../game-transport';
import type { Invites, NewInvite } from '../invite';
import type { OnlineData } from '../online-data';
import {
  MIN_BOARD_MATCHES,
  RATED_MATCHES_PER_PAIR_PER_DAY,
  START_RATING,
  isRatingsErrorData,
} from '../ratings';
import type { BoardRow, Ratings, RatingsErrorCode } from '../ratings';
import type { Safety } from '../safety';
import { TERMS_VERSION } from '../username';
import type { Usernames } from '../username';

/** Three saved players and a guest. */
export type RatingsContractPlayer = 'alice' | 'bob' | 'carol' | 'guest';

export interface RatingsContractSubject {
  /** The player id of each player, as views show it. */
  readonly idOf: (player: RatingsContractPlayer) => string;
  /** The port as a signed-in player, or with nobody signed in (`null`). */
  readonly ratingsFor: (player: RatingsContractPlayer | null) => Ratings;
  readonly invitesFor: (player: RatingsContractPlayer) => Invites;
  readonly gamesFor: (player: RatingsContractPlayer) => GameTransport;
  readonly friendsFor: (player: RatingsContractPlayer) => Friends;
  readonly safetyFor: (player: RatingsContractPlayer) => Safety;
  readonly usernamesFor: (player: RatingsContractPlayer) => Usernames;
  readonly onlineDataFor: (player: RatingsContractPlayer) => OnlineData;
  /**
   * Runs what the server does after a call (Convex: the scheduled
   * functions, such as the pages of an account delete). Never wait on a
   * real clock here.
   */
  readonly settle: () => Promise<void>;
}

export interface RatingsContractCheck {
  readonly name: string;
  readonly run: (subject: RatingsContractSubject) => Promise<void>;
}

/** A 3-point match: two new players move by `5 · 4·√3 / 2` ≈ 17.3. */
const GAME: NewInvite = { choice: 'portes', targetPoints: 3, turnTimeMinutes: null };

/** JSON with the keys of each object sorted: servers may order keys their own way. */
function sortedJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : inner,
  );
}

function same(actual: unknown, expected: unknown, what: string): void {
  const a = sortedJson(actual);
  const e = sortedJson(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(what);
}

async function failsWith(call: Promise<unknown>, code: RatingsErrorCode, what: string) {
  const reason = await call.then(
    () => {
      throw new Error(`${what}: expected a ${code} rejection, but the call resolved`);
    },
    (error: unknown) => error,
  );
  if (reason instanceof Error && reason.message.startsWith(what)) throw reason;
  if (!isRatingsErrorData(reason) || reason.code !== code) {
    throw new Error(`${what}: expected ${code}, got ${JSON.stringify(reason)}`);
  }
}

/** `from` invites `to`, and `to` accepts. Resolves to the game id. */
async function startGame(
  subject: RatingsContractSubject,
  from: RatingsContractPlayer,
  to: RatingsContractPlayer,
): Promise<string> {
  const code = await subject.invitesFor(from).createInvite(GAME);
  return await subject.invitesFor(to).acceptInvite(code);
}

/** `winner` wins a match against `loser` (the loser resigns). */
async function win(
  subject: RatingsContractSubject,
  winner: RatingsContractPlayer,
  loser: RatingsContractPlayer,
): Promise<void> {
  const gameId = await startGame(subject, winner, loser);
  await subject.gamesFor(loser).resign(gameId);
  await subject.settle();
}

async function setUsername(
  subject: RatingsContractSubject,
  player: RatingsContractPlayer,
  name: string,
): Promise<void> {
  await subject
    .usernamesFor(player)
    .setMine({ name, acceptTerms: TERMS_VERSION, ageChecked: true });
}

/** Alice wins `MIN_BOARD_MATCHES` rated matches against Bob and Carol (in one day). */
async function aliceListedMatches(subject: RatingsContractSubject): Promise<void> {
  for (let i = 0; i < MIN_BOARD_MATCHES; i += 1) {
    await win(subject, 'alice', i < RATED_MATCHES_PER_PAIR_PER_DAY ? 'bob' : 'carol');
  }
}

/** A board row without the name (servers give the guest number at random). */
function plain(row: BoardRow | undefined) {
  if (row === undefined) return undefined;
  return {
    playerId: row.playerId,
    rating: row.rating,
    matches: row.matches,
    rank: row.rank,
    me: row.me,
  };
}

export function ratingsContract(): readonly RatingsContractCheck[] {
  return [
    {
      name: 'refuses every call with nobody signed in, and a guest',
      run: async (subject) => {
        for (const [player, code] of [
          [null, 'NOT_SIGNED_IN'],
          ['guest', 'NOT_SAVED'],
        ] as const) {
          const ratings = subject.ratingsFor(player);
          await failsWith(ratings.mine(), code, `mine as ${player}`);
          await failsWith(ratings.friendsBoard(), code, `friendsBoard as ${player}`);
          await failsWith(ratings.globalBoard(), code, `globalBoard as ${player}`);
          await failsWith(ratings.setShown(false), code, `setShown as ${player}`);
        }
      },
    },
    {
      name: 'gives a new player the start rating, shown but not listed',
      run: async (subject) => {
        const ratings = subject.ratingsFor('alice');
        same(
          await ratings.mine(),
          { rating: START_RATING, matches: 0, experience: 0, shown: true, listed: false },
          'mine',
        );
        const board = await ratings.friendsBoard();
        same(
          board.map(plain),
          [
            {
              playerId: subject.idOf('alice'),
              rating: START_RATING,
              matches: 0,
              rank: 1,
              me: true,
            },
          ],
          'the friends board holds the caller',
        );
        same(await ratings.globalBoard(), [], 'the global board');
      },
    },
    {
      name: 'moves both ratings after a match between saved players, by the FIBS formula',
      run: async (subject) => {
        await win(subject, 'bob', 'alice');
        const bob = await subject.ratingsFor('bob').mine();
        const alice = await subject.ratingsFor('alice').mine();
        // Two new players, 3 points: 5 · 4·√3 · 0.5 = 17.32.
        same([bob.rating, bob.matches], [START_RATING + 17, 1], "bob's rating");
        // Experience is the points played: one match to 3.
        same(bob.experience, 3, "bob's experience");
        same([alice.rating, alice.matches], [START_RATING - 17, 1], "alice's rating");
        same((await subject.ratingsFor('carol').mine()).matches, 0, "carol's matches");
      },
    },
    {
      name: 'never rates a match with a guest',
      run: async (subject) => {
        await win(subject, 'alice', 'guest');
        await win(subject, 'guest', 'alice');
        same(
          await subject.ratingsFor('alice').mine(),
          {
            rating: START_RATING,
            matches: 0,
            experience: 0,
            shown: true,
            listed: false,
          },
          'alice after two guest matches',
        );
      },
    },
    {
      name: `rates at most ${RATED_MATCHES_PER_PAIR_PER_DAY} matches of one pair in a day`,
      run: async (subject) => {
        for (let i = 0; i <= RATED_MATCHES_PER_PAIR_PER_DAY; i += 1) {
          await win(subject, i % 2 === 0 ? 'alice' : 'bob', i % 2 === 0 ? 'bob' : 'alice');
        }
        same(
          (await subject.ratingsFor('alice').mine()).matches,
          RATED_MATCHES_PER_PAIR_PER_DAY,
          "alice's rated matches",
        );
        // Another pair still counts.
        await win(subject, 'alice', 'carol');
        same(
          (await subject.ratingsFor('alice').mine()).matches,
          RATED_MATCHES_PER_PAIR_PER_DAY + 1,
          'with carol',
        );
      },
    },
    {
      name: 'lists a player on the global board with a username, enough matches and "Show me" on',
      run: async (subject) => {
        await aliceListedMatches(subject);
        const before = await subject.ratingsFor('alice').mine();
        same([before.matches, before.listed], [MIN_BOARD_MATCHES, false], 'no username yet');
        same(await subject.ratingsFor('bob').globalBoard(), [], 'no row without a username');

        await setUsername(subject, 'alice', 'AliceOnBoard');
        same((await subject.ratingsFor('alice').mine()).listed, true, 'listed');
        const seen = await subject.ratingsFor('bob').globalBoard();
        same(seen.length, 1, 'one listed player');
        same(seen[0]?.name, { kind: 'username', name: 'AliceOnBoard' }, 'the name');
        same(
          plain(seen[0]),
          {
            playerId: subject.idOf('alice'),
            rating: before.rating,
            matches: MIN_BOARD_MATCHES,
            rank: 1,
            me: false,
          },
          'the row',
        );
        same((await subject.ratingsFor('alice').globalBoard())[0]?.me, true, 'her own row');

        await subject.ratingsFor('alice').setShown(false);
        const hidden = await subject.ratingsFor('alice').mine();
        same([hidden.shown, hidden.listed], [false, false], 'after "Show me" off');
        same(await subject.ratingsFor('bob').globalBoard(), [], 'off the board');
        await subject.ratingsFor('alice').setShown(true);
        same((await subject.ratingsFor('bob').globalBoard()).length, 1, 'back on');
      },
    },
    {
      name: 'hides a blocked player from the blocker on the global board only',
      run: async (subject) => {
        await aliceListedMatches(subject);
        await setUsername(subject, 'alice', 'AliceBlocked');
        await subject.safetyFor('bob').block(subject.idOf('alice'));
        same(await subject.ratingsFor('bob').globalBoard(), [], "bob's board");
        same((await subject.ratingsFor('carol').globalBoard()).length, 1, "carol's board");
      },
    },
    {
      name: 'shows the caller and their rated friends on the friends board, best first',
      run: async (subject) => {
        const token = await subject.friendsFor('bob').myFriendLink();
        await subject.friendsFor('alice').requestByLink(token);
        await subject.friendsFor('bob').acceptRequest(subject.idOf('alice'));
        await win(subject, 'bob', 'alice');
        await win(subject, 'carol', 'alice');
        const board = await subject.ratingsFor('alice').friendsBoard();
        same(
          board.map((row) => [row.playerId, row.rank, row.me]),
          [
            [subject.idOf('bob'), 1, false],
            [subject.idOf('alice'), 2, true],
          ],
          "alice's friends board (carol is no friend)",
        );
        check(board[0]?.name !== null, "a friend's name");
      },
    },
    {
      name: 'never rates a match that ends because a player deletes their account',
      run: async (subject) => {
        await startGame(subject, 'alice', 'bob');
        await subject.onlineDataFor('alice').deleteMyData();
        await subject.settle();
        same((await subject.ratingsFor('bob').mine()).matches, 0, "bob's matches");
        await failsWith(
          subject.ratingsFor('alice').mine(),
          'NOT_SIGNED_IN',
          'alice after the delete',
        );
      },
    },
  ];
}
