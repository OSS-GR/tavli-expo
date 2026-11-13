/**
 * The `Matchmaking` port contract (#531), as plain async checks that work
 * in any test runner (Vitest in packages, Jest in the app).
 *
 *   for (const check of matchmakingContract()) {
 *     it(check.name, () => check.run(makeSubject()));
 *   }
 *
 * Make a new subject for each check: three players with saved accounts
 * (`alice`, `bob`, `carol`) and one guest, on one server, with no seek,
 * no rated match and no block. The server clock stays in one UTC day for
 * the whole check (it moves at most a few minutes). A check rejects with
 * an `Error` when the adapter breaks the contract. The checks never wait
 * on a real clock: `advance` moves the server clock.
 */
import type { GameTransport, OnlineGameView } from '../game-transport';
import { RANKED_TURN_TIME_MINUTES } from '../game-transport';
import type { Invites } from '../invite';
import {
  RANKED_TARGET_POINTS,
  SEEK_RANGE_GROW_MS,
  SEEK_RANGE_MAX,
  SEEK_TTL_MS,
  isMatchmakingErrorData,
} from '../matchmaking';
import type { Matchmaking, MatchmakingErrorCode, MySeek, RankedGame } from '../matchmaking';
import type { OnlineData } from '../online-data';
import { RATED_MATCHES_PER_PAIR_PER_DAY, START_RATING } from '../ratings';
import type { Safety } from '../safety';

/** Three saved players and a guest. */
export type MatchmakingContractPlayer = 'alice' | 'bob' | 'carol' | 'guest';

export interface MatchmakingContractSubject {
  /** The player id of each player, as views show it. */
  readonly idOf: (player: MatchmakingContractPlayer) => string;
  /** The port as a signed-in player, or with nobody signed in (`null`). */
  readonly matchmakingFor: (player: MatchmakingContractPlayer | null) => Matchmaking;
  readonly gamesFor: (player: MatchmakingContractPlayer) => GameTransport;
  readonly invitesFor: (player: MatchmakingContractPlayer) => Invites;
  readonly safetyFor: (player: MatchmakingContractPlayer) => Safety;
  readonly onlineDataFor: (player: MatchmakingContractPlayer) => OnlineData;
  /** Sets the player's rating, as kept (a test hook: the servers write it only after a match). */
  readonly setRating: (player: MatchmakingContractPlayer, rating: number) => Promise<void>;
  /** Moves the server clock by `ms`, and runs what was due by then. Never a real wait. */
  readonly advance: (ms: number) => Promise<void>;
  /**
   * Runs the matching job now (the in-memory `runMatching`, the scheduled
   * Convex job), and what the server does after a call (Convex: the
   * scheduled functions, such as the pages of an account delete).
   */
  readonly runMatching: () => Promise<void>;
}

export interface MatchmakingContractCheck {
  readonly name: string;
  readonly run: (subject: MatchmakingContractSubject) => Promise<void>;
}

/** JSON with the keys of each object sorted: a server may send them in any order. */
function sorted(value: unknown): string {
  return JSON.stringify(value, (_key, part: unknown) =>
    part !== null && typeof part === 'object' && !Array.isArray(part)
      ? Object.fromEntries(
          Object.entries(part as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : part,
  );
}

function same(actual: unknown, expected: unknown, what: string): void {
  const a = sorted(actual);
  const e = sorted(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

function check(ok: boolean, what: string): void {
  if (!ok) throw new Error(what);
}

async function failsWith(call: Promise<unknown>, code: MatchmakingErrorCode, what: string) {
  const reason = await call.then(
    () => {
      throw new Error(`${what}: expected a ${code} rejection, but the call resolved`);
    },
    (error: unknown) => error,
  );
  if (reason instanceof Error && reason.message.startsWith(what)) throw reason;
  if (!isMatchmakingErrorData(reason) || reason.code !== code) {
    throw new Error(`${what}: expected ${code}, got ${JSON.stringify(reason)}`);
  }
}

/** Lets the network deliver: a few microtasks and a macrotask-free wait. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

async function seekOf(
  subject: MatchmakingContractSubject,
  player: MatchmakingContractPlayer,
): Promise<MySeek> {
  return await subject.matchmakingFor(player).mySeek();
}

async function seek(
  subject: MatchmakingContractSubject,
  player: MatchmakingContractPlayer,
  game: RankedGame = 'portes',
): Promise<void> {
  await subject.matchmakingFor(player).seek({ game });
}

/** The seek's kind (and the game id of a match). */
async function kindOf(
  subject: MatchmakingContractSubject,
  player: MatchmakingContractPlayer,
): Promise<string> {
  const mine = await seekOf(subject, player);
  return mine.kind;
}

async function gameIdOf(
  subject: MatchmakingContractSubject,
  player: MatchmakingContractPlayer,
): Promise<string> {
  const mine = await seekOf(subject, player);
  if (mine.kind !== 'matched') throw new Error(`${player} has no match: ${JSON.stringify(mine)}`);
  return mine.gameId;
}

/** The first view of a game the player sees. */
async function viewOf(transport: GameTransport, gameId: string): Promise<OnlineGameView> {
  // `subscribe` never calls back inside the call, so `stop` is set by then.
  return await new Promise<OnlineGameView>((resolve, reject) => {
    const stop = transport.subscribe(
      gameId,
      (view) => {
        stop();
        resolve(view);
      },
      (error) => {
        stop();
        reject(error instanceof Error ? error : new Error(JSON.stringify(error)));
      },
    );
  });
}

/** `from` and `to` meet (a friend game, resigned), so a block between them is allowed. */
async function meet(
  subject: MatchmakingContractSubject,
  from: MatchmakingContractPlayer,
  to: MatchmakingContractPlayer,
): Promise<void> {
  const code = await subject
    .invitesFor(from)
    .createInvite({ choice: 'portes', targetPoints: 1, turnTimeMinutes: null });
  const gameId = await subject.invitesFor(to).acceptInvite(code);
  await subject.gamesFor(to).resign(gameId);
  await subject.runMatching();
}

export function matchmakingContract(): readonly MatchmakingContractCheck[] {
  return [
    {
      name: 'refuses every call with nobody signed in, and a guest',
      run: async (subject) => {
        for (const [player, code] of [
          [null, 'NOT_SIGNED_IN'],
          ['guest', 'NOT_SAVED'],
        ] as const) {
          const port = subject.matchmakingFor(player);
          await failsWith(port.seek({ game: 'portes' }), code, `seek as ${player}`);
          await failsWith(port.cancel(), code, `cancel as ${player}`);
          await failsWith(port.mySeek(), code, `mySeek as ${player}`);
          await failsWith(port.lookingCounts(), code, `lookingCounts as ${player}`);
          const failure = await new Promise<unknown>((resolve) => {
            const stop = port.watchMySeek(
              () => {
                stop();
                resolve(new Error(`watchMySeek as ${player}: sent a seek`));
              },
              (error) => {
                stop();
                resolve(error);
              },
            );
          });
          check(
            isMatchmakingErrorData(failure) && failure.code === code,
            `watchMySeek as ${player}: expected ${code}, got ${JSON.stringify(failure)}`,
          );
        }
      },
    },
    {
      name: 'refuses a game that is not ranked',
      run: async (subject) => {
        const port = subject.matchmakingFor('alice');
        await failsWith(port.seek({ game: 'asodio' as RankedGame }), 'BAD_REQUEST', 'asodio');
        await failsWith(port.seek({ game: 'chess' as RankedGame }), 'BAD_REQUEST', 'chess');
        same(await port.mySeek(), { kind: 'none' }, 'no seek after a refusal');
      },
    },
    {
      name: 'keeps a lone seek waiting, and counts it for the others',
      run: async (subject) => {
        same(await seekOf(subject, 'alice'), { kind: 'none' }, 'before the seek');
        await seek(subject, 'alice', 'fevga');
        const mine = await seekOf(subject, 'alice');
        if (mine.kind !== 'waiting') throw new Error(`a waiting seek: ${JSON.stringify(mine)}`);
        same([mine.game, mine.rating], ['fevga', START_RATING], 'the game and the rating');
        check(Number.isFinite(mine.since), 'since is a time');
        same(
          await subject.matchmakingFor('bob').lookingCounts(),
          { portes: 0, plakoto: 0, fevga: 1, tavli: 0 },
          "bob's counts",
        );
        same(
          await subject.matchmakingFor('alice').lookingCounts(),
          { portes: 0, plakoto: 0, fevga: 0, tavli: 0 },
          'alice never counts herself',
        );
      },
    },
    {
      name: 'matches two saved players with close ratings into one ranked game',
      run: async (subject) => {
        await seek(subject, 'alice', 'tavli');
        await seek(subject, 'bob', 'tavli');
        const aliceSeek = await seekOf(subject, 'alice');
        const bobSeek = await seekOf(subject, 'bob');
        if (aliceSeek.kind !== 'matched' || bobSeek.kind !== 'matched') {
          throw new Error(`both matched: ${JSON.stringify([aliceSeek, bobSeek])}`);
        }
        same(bobSeek.gameId, aliceSeek.gameId, 'one game');
        same(aliceSeek.game, 'tavli', 'the game');
        same(
          [aliceSeek.me.rating, aliceSeek.opponent.rating],
          [START_RATING, START_RATING],
          'ratings',
        );
        check(aliceSeek.opponent.name !== null, "the opponent's name");
        same(aliceSeek.opponent, bobSeek.me, 'alice sees bob as bob sees himself');
        const view = await viewOf(subject.gamesFor('bob'), aliceSeek.gameId);
        same(
          [view.choice, view.ranked, view.turnTimeMinutes, view.match.targetPoints],
          ['tavli', true, RANKED_TURN_TIME_MINUTES, RANKED_TARGET_POINTS],
          'a ranked match',
        );
        same(
          [view.players.white, view.players.black],
          [subject.idOf('alice'), subject.idOf('bob')],
          'the older seek plays White',
        );
        same(
          await subject.matchmakingFor('carol').lookingCounts(),
          { portes: 0, plakoto: 0, fevga: 0, tavli: 0 },
          'a match is no longer looking',
        );
      },
    },
    {
      name: 'never matches two different games',
      run: async (subject) => {
        await seek(subject, 'alice', 'portes');
        await seek(subject, 'bob', 'plakoto');
        await subject.runMatching();
        same(
          [await kindOf(subject, 'alice'), await kindOf(subject, 'bob')],
          ['waiting', 'waiting'],
          'both wait',
        );
      },
    },
    {
      name: 'keeps one seek per player: the same game keeps it, another game replaces it',
      run: async (subject) => {
        await seek(subject, 'alice', 'portes');
        const first = await seekOf(subject, 'alice');
        await subject.advance(1000);
        await seek(subject, 'alice', 'portes');
        same(await seekOf(subject, 'alice'), first, 'the same seek');
        await seek(subject, 'alice', 'fevga');
        same(
          await subject.matchmakingFor('bob').lookingCounts(),
          { portes: 0, plakoto: 0, fevga: 1, tavli: 0 },
          'only the new game',
        );
        await seek(subject, 'bob', 'portes');
        same(await kindOf(subject, 'bob'), 'waiting', 'the old seek never matches');
      },
    },
    {
      name: 'removes a cancelled seek, which never matches',
      run: async (subject) => {
        await subject.matchmakingFor('alice').cancel();
        await seek(subject, 'alice');
        await subject.matchmakingFor('alice').cancel();
        same(await seekOf(subject, 'alice'), { kind: 'none' }, 'after the cancel');
        await seek(subject, 'bob');
        await subject.runMatching();
        same(await kindOf(subject, 'bob'), 'waiting', 'bob waits');
        same((await subject.matchmakingFor('bob').lookingCounts()).portes, 0, 'nobody else looks');
      },
    },
    {
      name: 'never matches two players where one blocks the other',
      run: async (subject) => {
        await meet(subject, 'alice', 'bob');
        for (const [blocker, blocked] of [
          ['alice', 'bob'],
          ['bob', 'alice'],
        ] as const) {
          await subject.safetyFor(blocker).block(subject.idOf(blocked));
          await seek(subject, 'alice');
          await seek(subject, 'bob');
          await subject.advance(SEEK_RANGE_GROW_MS);
          await subject.runMatching();
          same(
            [await kindOf(subject, 'alice'), await kindOf(subject, 'bob')],
            ['waiting', 'waiting'],
            `${blocker} blocks ${blocked}`,
          );
          await subject.matchmakingFor('alice').cancel();
          await subject.matchmakingFor('bob').cancel();
          await subject.safetyFor(blocker).unblock(subject.idOf(blocked));
        }
        await subject.safetyFor('alice').block(subject.idOf('bob'));
        await seek(subject, 'alice');
        await seek(subject, 'bob');
        await seek(subject, 'carol');
        const carol = await gameIdOf(subject, 'carol');
        same(await gameIdOf(subject, 'alice'), carol, 'carol plays the older seek');
        same(await kindOf(subject, 'bob'), 'waiting', 'bob still waits');
      },
    },
    {
      name: 'hides the name of a matched opponent the caller blocks, from the caller only',
      run: async (subject) => {
        await seek(subject, 'alice');
        await seek(subject, 'bob');
        await subject.safetyFor('alice').block(subject.idOf('bob'));
        const aliceSeek = await seekOf(subject, 'alice');
        const bobSeek = await seekOf(subject, 'bob');
        if (aliceSeek.kind !== 'matched' || bobSeek.kind !== 'matched') {
          throw new Error(`both matched: ${JSON.stringify([aliceSeek, bobSeek])}`);
        }
        same(aliceSeek.opponent.name, null, 'alice sees no name');
        check(aliceSeek.me.name !== null, 'alice still sees her own name');
        check(bobSeek.opponent.name !== null, 'bob still sees alice');
      },
    },
    {
      name: `never matches one pair more than ${RATED_MATCHES_PER_PAIR_PER_DAY} times a day`,
      run: async (subject) => {
        for (let i = 0; i < RATED_MATCHES_PER_PAIR_PER_DAY; i += 1) {
          await seek(subject, 'alice');
          await seek(subject, 'bob');
          const gameId = await gameIdOf(subject, 'alice');
          // The winners take turns, so the ratings stay close.
          await subject.gamesFor(i % 2 === 0 ? 'bob' : 'alice').resign(gameId);
          await subject.runMatching();
        }
        await seek(subject, 'alice');
        await seek(subject, 'bob');
        await subject.advance(SEEK_RANGE_GROW_MS);
        await subject.runMatching();
        same(
          [await kindOf(subject, 'alice'), await kindOf(subject, 'bob')],
          ['waiting', 'waiting'],
          'the pair waits',
        );
        await seek(subject, 'carol');
        same(await kindOf(subject, 'carol'), 'matched', 'another pair still matches');
      },
    },
    {
      name: 'widens the rating range over time, never past the widest range',
      run: async (subject) => {
        await subject.setRating('alice', START_RATING);
        await subject.setRating('bob', START_RATING + 100);
        await subject.setRating('carol', START_RATING + SEEK_RANGE_MAX + 1);
        await seek(subject, 'carol');
        await seek(subject, 'alice');
        await subject.advance(SEEK_RANGE_GROW_MS * 2);
        await subject.runMatching();
        same(
          [await kindOf(subject, 'alice'), await kindOf(subject, 'carol')],
          ['waiting', 'waiting'],
          'too far apart',
        );
        await seek(subject, 'bob');
        await subject.runMatching();
        same(await kindOf(subject, 'bob'), 'waiting', '100 apart: bob is new, his range is narrow');
        // 50 + 350 · 15 / 60 ≈ 137 after 15 s.
        await subject.advance(15 * 1000);
        await subject.runMatching();
        same(await gameIdOf(subject, 'bob'), await gameIdOf(subject, 'alice'), 'matched');
        same(await kindOf(subject, 'carol'), 'waiting', 'carol still waits');
      },
    },
    {
      name: 'ends a seek with no match after its time',
      run: async (subject) => {
        await seek(subject, 'alice');
        await subject.advance(SEEK_TTL_MS);
        await subject.runMatching();
        same(await seekOf(subject, 'alice'), { kind: 'none' }, 'after its time');
        await seek(subject, 'bob');
        same(await kindOf(subject, 'bob'), 'waiting', 'an ended seek never matches');
      },
    },
    {
      name: 'sends the seek live: waiting, then matched',
      run: async (subject) => {
        const seen: MySeek[] = [];
        const stop = subject.matchmakingFor('alice').watchMySeek((mine) => seen.push(mine));
        await flush();
        await subject.runMatching();
        await seek(subject, 'alice');
        await subject.runMatching();
        await flush();
        await seek(subject, 'bob');
        await subject.runMatching();
        await flush();
        stop();
        const kinds = seen.map((mine) => mine.kind);
        same(kinds, ['none', 'waiting', 'matched'], 'the seeks sent');
        const last = seen.at(-1);
        same(
          last?.kind === 'matched' ? last.gameId : null,
          await gameIdOf(subject, 'bob'),
          'the game',
        );
      },
    },
    {
      name: 'removes the seek of a deleted account',
      run: async (subject) => {
        await seek(subject, 'alice');
        await subject.onlineDataFor('alice').deleteMyData();
        await subject.runMatching();
        await seek(subject, 'bob');
        same(await kindOf(subject, 'bob'), 'waiting', 'bob waits');
        same((await subject.matchmakingFor('bob').lookingCounts()).portes, 0, 'nobody else');
        await failsWith(
          subject.matchmakingFor('alice').mySeek(),
          'NOT_SIGNED_IN',
          'alice after the delete',
        );
      },
    },
  ];
}
