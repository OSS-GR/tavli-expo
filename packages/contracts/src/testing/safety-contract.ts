/**
 * The `Safety` port contract (#320), as plain async checks that work in
 * any test runner (Vitest in packages, Jest in the app).
 *
 *   for (const check of safetyContract()) {
 *     it(check.name, () => check.run(makeSubject()));
 *   }
 *
 * Make a new subject for each check: three players on one server who
 * have not met. A check rejects with an `Error` when the adapter breaks
 * the contract. The checks never wait on a real clock.
 *
 * The caps (`MAX_BLOCKS`, `MAX_REPORTS_PER_DAY`) need many players, so
 * each server tests them on its own.
 */
import type { GameTransport, OnlineGameView } from '../game-transport';
import type { InviteErrorCode, Invites, NewInvite } from '../invite';
import { isInviteErrorData } from '../invite';
import type { OnlineData } from '../online-data';
import type { PlayerName } from '../player-name';
import { isSafetyErrorData } from '../safety';
import type { ReportReason, Safety, SafetyErrorCode } from '../safety';

/** Three players who have not met. */
export type SafetyContractPlayer = 'alice' | 'bob' | 'carol';

export interface SafetyContractSubject {
  /** The player id of each player, as views show it. */
  readonly idOf: (player: SafetyContractPlayer) => string;
  /** The port as a signed-in player, or with nobody signed in (`null`). */
  readonly safetyFor: (player: SafetyContractPlayer | null) => Safety;
  readonly invitesFor: (player: SafetyContractPlayer) => Invites;
  readonly gamesFor: (player: SafetyContractPlayer) => GameTransport;
  readonly onlineDataFor: (player: SafetyContractPlayer) => OnlineData;
  /**
   * Runs what the server does after a call (Convex: the scheduled
   * functions, such as the pages of an account delete). Never wait on a
   * real clock here.
   */
  readonly settle: () => Promise<void>;
}

export interface SafetyContractCheck {
  readonly name: string;
  readonly run: (subject: SafetyContractSubject) => Promise<void>;
}

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

/** `call` rejects with plain data that `isData` accepts, with `code`. */
async function rejects(
  call: Promise<unknown>,
  code: string,
  isData: (value: unknown) => value is { code: string },
  what: string,
): Promise<void> {
  const reason = await call.then(
    () => {
      throw new Error(`${what}: expected a ${code} rejection, but the call resolved`);
    },
    (error: unknown) => error,
  );
  if (reason instanceof Error && reason.message.startsWith(what)) throw reason;
  if (!isData(reason) || reason.code !== code) {
    throw new Error(`${what}: expected ${code}, got ${JSON.stringify(reason)}`);
  }
}

function failsWith(call: Promise<unknown>, code: SafetyErrorCode, what: string) {
  return rejects(call, code, isSafetyErrorData, what);
}

function inviteFailsWith(call: Promise<unknown>, code: InviteErrorCode, what: string) {
  return rejects(call, code, isInviteErrorData, what);
}

/** `from` invites `to`, and `to` accepts. Resolves to the game id. */
async function playGame(
  subject: SafetyContractSubject,
  from: SafetyContractPlayer,
  to: SafetyContractPlayer,
): Promise<string> {
  const code = await subject.invitesFor(from).createInvite(GAME);
  return await subject.invitesFor(to).acceptInvite(code);
}

/** The first view of the game that `player` gets. */
function firstView(
  subject: SafetyContractSubject,
  player: SafetyContractPlayer,
  gameId: string,
): Promise<OnlineGameView> {
  return new Promise((resolve, reject) => {
    let stop: (() => void) | null = null;
    let done = false;
    stop = subject.gamesFor(player).subscribe(
      gameId,
      (view) => {
        done = true;
        stop?.();
        resolve(view);
      },
      (error) => {
        done = true;
        stop?.();
        reject(error instanceof Error ? error : new Error(JSON.stringify(error)));
      },
    );
    if (done) stop();
  });
}

/** The name `player` sees for the other player of their only active game. */
async function opponentNameSeenBy(
  subject: SafetyContractSubject,
  player: SafetyContractPlayer,
): Promise<PlayerName | null> {
  const games = await subject.gamesFor(player).listMyGames({ status: 'active' });
  same(games.length, 1, `${player}'s active games`);
  return games[0]?.opponentName ?? null;
}

export function safetyContract(): readonly SafetyContractCheck[] {
  return [
    {
      name: 'refuses every call with nobody signed in',
      run: async (subject) => {
        const safety = subject.safetyFor(null);
        const bob = subject.idOf('bob');
        await failsWith(safety.block(bob), 'NOT_SIGNED_IN', 'block()');
        await failsWith(safety.unblock(bob), 'NOT_SIGNED_IN', 'unblock()');
        await failsWith(safety.listBlocked(), 'NOT_SIGNED_IN', 'listBlocked()');
        await failsWith(
          safety.report({ playerId: bob, reason: 'name' }),
          'NOT_SIGNED_IN',
          'report()',
        );
      },
    },
    {
      name: 'blocks only a player met in a game or an answered invite',
      run: async (subject) => {
        const alice = subject.safetyFor('alice');
        const bob = subject.idOf('bob');
        await failsWith(alice.block(bob), 'UNKNOWN_PLAYER', 'a player never met');
        await failsWith(
          alice.report({ playerId: bob, reason: 'name' }),
          'UNKNOWN_PLAYER',
          'a report of a player never met',
        );
        await failsWith(alice.block(subject.idOf('alice')), 'BAD_REQUEST', 'yourself');
        await failsWith(alice.block(''), 'BAD_REQUEST', 'an empty id');

        // An invite seen but not answered is not enough.
        const code = await subject.invitesFor('alice').createInvite(GAME);
        await subject.invitesFor('bob').getInvite(code);
        await failsWith(
          subject.safetyFor('bob').block(subject.idOf('alice')),
          'UNKNOWN_PLAYER',
          'an open invite',
        );
        // Declined: both may block the other now.
        await subject.invitesFor('bob').declineInvite(code);
        await subject.safetyFor('bob').block(subject.idOf('alice'));
        await alice.block(bob);
        // Carol met nobody.
        await failsWith(
          subject.safetyFor('carol').block(bob),
          'UNKNOWN_PLAYER',
          'carol blocks bob',
        );
        same(await subject.safetyFor('carol').listBlocked(), [], "carol's blocks");
      },
    },
    {
      name: 'a block hides the name for the blocker only, until unblock',
      run: async (subject) => {
        const gameId = await playGame(subject, 'alice', 'bob');
        const bobName = await opponentNameSeenBy(subject, 'alice');
        const aliceName = await opponentNameSeenBy(subject, 'bob');
        check(bobName !== null && aliceName !== null, 'both players have a name before the block');

        const alice = subject.safetyFor('alice');
        await alice.block(subject.idOf('bob'));
        same(await opponentNameSeenBy(subject, 'alice'), null, 'the name alice sees in her list');
        same(await opponentNameSeenBy(subject, 'bob'), aliceName, 'the name bob sees');
        const view = await firstView(subject, 'alice', gameId);
        same(view.names, { white: aliceName, black: null }, "alice's view of the names");
        same((await firstView(subject, 'bob', gameId)).names.white, aliceName, "bob's view");

        const blocked = await alice.listBlocked();
        same(blocked.length, 1, 'one block');
        same(blocked[0]?.playerId, subject.idOf('bob'), 'the blocked id');
        same(blocked[0]?.name, bobName, 'the list shows the name');
        check(typeof blocked[0]?.blockedAt === 'number', 'blockedAt is a number');
        same(await subject.safetyFor('bob').listBlocked(), [], "bob's blocks");

        await alice.unblock(subject.idOf('bob'));
        same(await alice.listBlocked(), [], 'after unblock');
        same(await opponentNameSeenBy(subject, 'alice'), bobName, 'the name after unblock');
      },
    },
    {
      name: 'a block hides the inviter name and stops new games both ways',
      run: async (subject) => {
        const gameId = await playGame(subject, 'alice', 'bob');
        await subject.safetyFor('alice').block(subject.idOf('bob'));

        const fromBob = await subject.invitesFor('bob').createInvite(GAME);
        same(
          (await subject.invitesFor('alice').getInvite(fromBob))?.fromName,
          null,
          'the inviter name alice sees',
        );
        check(
          (await subject.invitesFor('carol').getInvite(fromBob))?.fromName !== null,
          'carol still sees the inviter name',
        );
        await inviteFailsWith(
          subject.invitesFor('alice').acceptInvite(fromBob),
          'BLOCKED',
          'alice accepts bob',
        );
        const fromAlice = await subject.invitesFor('alice').createInvite(GAME);
        await inviteFailsWith(
          subject.invitesFor('bob').acceptInvite(fromAlice),
          'BLOCKED',
          'bob accepts alice',
        );
        same(
          (await subject.invitesFor('bob').getInvite(fromAlice))?.status,
          'open',
          'the invite stays open',
        );
        // The running game goes on.
        same((await firstView(subject, 'bob', gameId)).status, 'active', 'the old game');

        await subject.safetyFor('alice').unblock(subject.idOf('bob'));
        check(
          typeof (await subject.invitesFor('bob').acceptInvite(fromAlice)) === 'string',
          'a game starts after unblock',
        );
      },
    },
    {
      name: 'block and unblock twice change nothing',
      run: async (subject) => {
        await playGame(subject, 'alice', 'bob');
        const alice = subject.safetyFor('alice');
        const bob = subject.idOf('bob');
        await alice.unblock(bob);
        await alice.block(bob);
        await alice.block(bob);
        same((await alice.listBlocked()).length, 1, 'one block');
        await alice.unblock(bob);
        await alice.unblock(bob);
        same(await alice.listBlocked(), [], 'no block');
      },
    },
    {
      name: 'a report needs a known reason, blocks, and may come again',
      run: async (subject) => {
        await playGame(subject, 'bob', 'alice');
        const alice = subject.safetyFor('alice');
        const bob = subject.idOf('bob');
        await failsWith(
          alice.report({ playerId: bob, reason: 'rude' as ReportReason }),
          'BAD_REQUEST',
          'an unknown reason',
        );
        same(await alice.listBlocked(), [], 'no block after a refused report');
        await alice.report({ playerId: bob, reason: 'name' });
        same(
          (await alice.listBlocked()).map((row) => row.playerId),
          [bob],
          'the report blocks',
        );
        await alice.report({ playerId: bob, reason: 'cheating' });
        // An unblock after a report keeps the report, and may block again.
        await alice.unblock(bob);
        await alice.report({ playerId: bob, reason: 'other' });
        same((await alice.listBlocked()).length, 1, 'blocked again');
      },
    },
    {
      name: 'a deleted account cannot be blocked, and its blocks go',
      run: async (subject) => {
        await playGame(subject, 'alice', 'bob');
        await playGame(subject, 'carol', 'bob');
        await subject.safetyFor('alice').block(subject.idOf('bob'));
        await subject.safetyFor('bob').block(subject.idOf('carol'));
        await subject.onlineDataFor('bob').deleteMyData();
        await subject.settle();
        same(await subject.safetyFor('alice').listBlocked(), [], "alice's block of bob");
        await failsWith(
          subject.safetyFor('carol').block(subject.idOf('bob')),
          'UNKNOWN_PLAYER',
          'block a deleted player',
        );
        await failsWith(
          subject.safetyFor('carol').report({ playerId: subject.idOf('bob'), reason: 'name' }),
          'UNKNOWN_PLAYER',
          'report a deleted player',
        );
        await failsWith(
          subject.safetyFor('bob').block(subject.idOf('carol')),
          'NOT_SIGNED_IN',
          'the deleted player blocks',
        );
      },
    },
  ];
}
