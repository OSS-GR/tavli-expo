/**
 * The `OnlineData` port contract (#315), as plain async checks that work
 * in any test runner (Vitest in packages, Jest in the app).
 *
 *   for (const check of onlineDataContract()) {
 *     it(check.name, () => check.run(makeSubject()));
 *   }
 *
 * Make a new subject for each check: two players with an account on one
 * server, and no game or invite yet. A check rejects with an `Error` when
 * the adapter breaks the contract. The checks read what the server keeps
 * through the `Invites` and `GameTransport` ports of the same server.
 */
import { isGameTransportErrorData } from '../game-transport';
import type { GameSummary, GameTransport } from '../game-transport';
import { isInviteErrorData } from '../invite';
import type { Invites, NewInvite } from '../invite';
import type { OnlineData } from '../online-data';

/**
 * - `me`: the player who deletes their data.
 * - `friend`: the player who plays them, and keeps their own data.
 */
export type OnlineDataContractPlayer = 'me' | 'friend';

export interface OnlineDataContractSubject {
  /** The port as a signed-in player, or with nobody signed in (`null`). */
  readonly dataFor: (player: OnlineDataContractPlayer | null) => OnlineData;
  /** The `Invites` of a player, on the same server. */
  readonly invitesFor: (player: OnlineDataContractPlayer) => Invites;
  /** The `GameTransport` of a player, on the same server. */
  readonly gamesFor: (player: OnlineDataContractPlayer) => GameTransport;
}

export interface OnlineDataContractCheck {
  readonly name: string;
  readonly run: (subject: OnlineDataContractSubject) => Promise<void>;
}

const GAME: NewInvite = { choice: 'portes', targetPoints: 3, turnTimeMinutes: null };

function same(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

async function rejection(call: Promise<unknown>, what: string): Promise<unknown> {
  return await call.then(
    () => {
      throw new Error(`${what} resolved`);
    },
    (error: unknown) => error,
  );
}

/** `call` rejects with `code`, as plain data (`GameTransportErrorData` or `InviteErrorData`). */
async function failsWith(call: Promise<unknown>, code: string, what: string): Promise<void> {
  const reason = await rejection(call, what);
  const data = isGameTransportErrorData(reason) || isInviteErrorData(reason);
  if (!data || reason.code !== code) {
    throw new Error(`${what}: expected ${code}, got ${JSON.stringify(reason)}`);
  }
  same(JSON.parse(JSON.stringify(reason)), reason, `${what}: the error is plain JSON`);
}

/** Starts a match between the two players: `me` invites, `friend` accepts. */
async function startMatch(subject: OnlineDataContractSubject): Promise<string> {
  const code = await subject.invitesFor('me').createInvite(GAME);
  return await subject.invitesFor('friend').acceptInvite(code);
}

/** The friend's summary of `gameId` in their list of `status` games, or `undefined`. */
async function friendSummary(
  subject: OnlineDataContractSubject,
  status: 'active' | 'finished',
  gameId: string,
): Promise<GameSummary | undefined> {
  const games = await subject.gamesFor('friend').listMyGames({ status });
  return games.find((game) => game.gameId === gameId);
}

export function onlineDataContract(): OnlineDataContractCheck[] {
  return [
    {
      name: 'with nobody signed in, it fails NOT_SIGNED_IN as plain data',
      run: async ({ dataFor }) => {
        await failsWith(dataFor(null).deleteMyData(), 'NOT_SIGNED_IN', 'delete');
      },
    },
    {
      name: 'it deletes once: a second call fails NOT_SIGNED_IN',
      run: async ({ dataFor }) => {
        await dataFor('me').deleteMyData();
        await failsWith(dataFor('me').deleteMyData(), 'NOT_SIGNED_IN', 'the second delete');
      },
    },
    {
      name: 'a match in progress is resigned: the friend wins it, and it stays as finished',
      run: async (subject) => {
        const gameId = await startMatch(subject);
        if ((await friendSummary(subject, 'active', gameId)) === undefined) {
          throw new Error('the new match is not active');
        }
        await subject.dataFor('me').deleteMyData();
        same(await friendSummary(subject, 'active', gameId), undefined, 'the active list');
        const finished = await friendSummary(subject, 'finished', gameId);
        if (finished === undefined) throw new Error('the match is not in the finished list');
        same(finished.winner, finished.mySide, 'the winner');
      },
    },
    {
      name: 'a finished match stays as it was, without my name',
      run: async (subject) => {
        const gameId = await startMatch(subject);
        // The friend resigns: I win.
        await subject.gamesFor('friend').resign(gameId);
        const before = await friendSummary(subject, 'finished', gameId);
        if (before === undefined) throw new Error('the match did not finish');
        if (before.opponentName === null) throw new Error('my name: none before the delete');
        await subject.dataFor('me').deleteMyData();
        // My guest name goes with my data (#400); the rest stays.
        same(
          await friendSummary(subject, 'finished', gameId),
          { ...before, opponentName: null },
          'the finished match',
        );
      },
    },
    {
      name: 'my open invites go: nobody can open or accept them',
      run: async (subject) => {
        const code = await subject.invitesFor('me').createInvite(GAME);
        await subject.dataFor('me').deleteMyData();
        const friend = subject.invitesFor('friend');
        same(await friend.getInvite(code), null, 'the invite');
        await failsWith(friend.acceptInvite(code), 'INVITE_NOT_FOUND', 'accept');
      },
    },
    {
      name: "the friend's open invites stay",
      run: async (subject) => {
        const friend = subject.invitesFor('friend');
        const code = await friend.createInvite(GAME);
        await subject.dataFor('me').deleteMyData();
        same(
          (await friend.listMyInvites()).map((invite) => invite.code),
          [code],
          "the friend's invites",
        );
      },
    },
    {
      name: 'after it, the old sign-in can neither make nor accept an invite',
      run: async (subject) => {
        const code = await subject.invitesFor('friend').createInvite(GAME);
        await subject.dataFor('me').deleteMyData();
        const me = subject.invitesFor('me');
        await failsWith(me.createInvite(GAME), 'NOT_SIGNED_IN', 'make an invite');
        await failsWith(me.acceptInvite(code), 'NOT_SIGNED_IN', 'accept an invite');
      },
    },
  ];
}
