/**
 * The `Friends` port contract (#406), as plain async checks that work in
 * any test runner (Vitest in packages, Jest in the app).
 *
 *   for (const check of friendsContract()) {
 *     it(check.name, () => check.run(makeSubject()));
 *   }
 *
 * Make a new subject for each check: three players with saved accounts
 * (`alice`, `bob`, `carol`) and one guest, on one server, who have not
 * met. A check rejects with an `Error` when the adapter breaks the
 * contract. The checks never wait on a real clock.
 *
 * The caps, the hourly search limit and the wait after a decline need
 * many players or a clock, so each server tests them on its own.
 */
import { isFriendsErrorData } from '../friends';
import type { Friends, FriendsErrorCode } from '../friends';
import type { GameTransport } from '../game-transport';
import { isInviteErrorData } from '../invite';
import type { InviteErrorCode, Invites, NewInvite } from '../invite';
import type { OnlineData } from '../online-data';
import type { Safety } from '../safety';
import { TERMS_VERSION } from '../username';
import type { Usernames } from '../username';

/** Three saved players and a guest. */
export type FriendsContractPlayer = 'alice' | 'bob' | 'carol' | 'guest';

export interface FriendsContractSubject {
  /** The player id of each player, as views show it. */
  readonly idOf: (player: FriendsContractPlayer) => string;
  /** The port as a signed-in player, or with nobody signed in (`null`). */
  readonly friendsFor: (player: FriendsContractPlayer | null) => Friends;
  readonly invitesFor: (player: FriendsContractPlayer) => Invites;
  readonly gamesFor: (player: FriendsContractPlayer) => GameTransport;
  readonly safetyFor: (player: FriendsContractPlayer) => Safety;
  readonly usernamesFor: (player: FriendsContractPlayer) => Usernames;
  readonly onlineDataFor: (player: FriendsContractPlayer) => OnlineData;
  /**
   * Runs what the server does after a call (Convex: the scheduled
   * functions, such as the pages of an account delete). Never wait on a
   * real clock here.
   */
  readonly settle: () => Promise<void>;
}

export interface FriendsContractCheck {
  readonly name: string;
  readonly run: (subject: FriendsContractSubject) => Promise<void>;
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

function failsWith(call: Promise<unknown>, code: FriendsErrorCode, what: string) {
  return rejects(call, code, isFriendsErrorData, what);
}

function inviteFailsWith(call: Promise<unknown>, code: InviteErrorCode, what: string) {
  return rejects(call, code, isInviteErrorData, what);
}

/** `from` invites `to`, and `to` accepts. Resolves to the game id. */
async function playGame(
  subject: FriendsContractSubject,
  from: FriendsContractPlayer,
  to: FriendsContractPlayer,
): Promise<string> {
  const code = await subject.invitesFor(from).createInvite(GAME);
  return await subject.invitesFor(to).acceptInvite(code);
}

/** `from` and `to` become friends through `from`'s request. */
async function befriend(
  subject: FriendsContractSubject,
  from: FriendsContractPlayer,
  to: FriendsContractPlayer,
): Promise<void> {
  const token = await subject.friendsFor(to).myFriendLink();
  same(await subject.friendsFor(from).requestByLink(token), 'sent', `${from} asks ${to}`);
  await subject.friendsFor(to).acceptRequest(subject.idOf(from));
}

/** The ids of `player`'s friends. */
async function friendIds(
  subject: FriendsContractSubject,
  player: FriendsContractPlayer,
): Promise<string[]> {
  return (await subject.friendsFor(player).listFriends()).map((friend) => friend.playerId);
}

async function setUsername(
  subject: FriendsContractSubject,
  player: FriendsContractPlayer,
  name: string,
): Promise<void> {
  await subject
    .usernamesFor(player)
    .setMine({ name, acceptTerms: TERMS_VERSION, ageChecked: true });
}

export function friendsContract(): readonly FriendsContractCheck[] {
  return [
    {
      name: 'refuses every call with nobody signed in',
      run: async (subject) => {
        const friends = subject.friendsFor(null);
        const bob = subject.idOf('bob');
        const what = 'with nobody signed in';
        await failsWith(friends.listFriends(), 'NOT_SIGNED_IN', `listFriends() ${what}`);
        await failsWith(friends.listRequests(), 'NOT_SIGNED_IN', `listRequests() ${what}`);
        await failsWith(friends.recentPlayers(), 'NOT_SIGNED_IN', `recentPlayers() ${what}`);
        await failsWith(friends.findPlayer('bob'), 'NOT_SIGNED_IN', `findPlayer() ${what}`);
        await failsWith(friends.myFriendLink(), 'NOT_SIGNED_IN', `myFriendLink() ${what}`);
        await failsWith(friends.resetFriendLink(), 'NOT_SIGNED_IN', `resetFriendLink() ${what}`);
        const token = await subject.friendsFor('bob').myFriendLink();
        await failsWith(friends.openFriendLink(token), 'NOT_SIGNED_IN', `openFriendLink() ${what}`);
        await failsWith(friends.requestByLink(token), 'NOT_SIGNED_IN', `requestByLink() ${what}`);
        await failsWith(
          friends.requestByUsername('bob'),
          'NOT_SIGNED_IN',
          `requestByUsername() ${what}`,
        );
        await failsWith(friends.sendRequest(bob), 'NOT_SIGNED_IN', `sendRequest() ${what}`);
        await failsWith(friends.acceptRequest(bob), 'NOT_SIGNED_IN', `acceptRequest() ${what}`);
        await failsWith(friends.declineRequest(bob), 'NOT_SIGNED_IN', `declineRequest() ${what}`);
        await failsWith(friends.cancelRequest(bob), 'NOT_SIGNED_IN', `cancelRequest() ${what}`);
        await failsWith(friends.removeFriend(bob), 'NOT_SIGNED_IN', `removeFriend() ${what}`);
        await failsWith(friends.inviteFriend(bob, GAME), 'NOT_SIGNED_IN', `inviteFriend() ${what}`);
        await failsWith(
          friends.listFriendInvites(),
          'NOT_SIGNED_IN',
          `listFriendInvites() ${what}`,
        );
      },
    },
    {
      name: 'a guest has no friends and cannot be asked, but may open a link',
      run: async (subject) => {
        const guest = subject.friendsFor('guest');
        const what = 'as a guest';
        await failsWith(guest.listFriends(), 'NOT_SAVED', `listFriends() ${what}`);
        await failsWith(guest.listRequests(), 'NOT_SAVED', `listRequests() ${what}`);
        await failsWith(guest.recentPlayers(), 'NOT_SAVED', `recentPlayers() ${what}`);
        await failsWith(guest.findPlayer('bob'), 'NOT_SAVED', `findPlayer() ${what}`);
        await failsWith(guest.myFriendLink(), 'NOT_SAVED', `myFriendLink() ${what}`);
        await failsWith(guest.listFriendInvites(), 'NOT_SAVED', `listFriendInvites() ${what}`);
        const token = await subject.friendsFor('bob').myFriendLink();
        same((await guest.openFriendLink(token))?.status, 'none', 'a guest opens a friend link');
        await failsWith(guest.requestByLink(token), 'NOT_SAVED', `requestByLink() ${what}`);

        // Alice played the guest, but cannot ask them, and does not see them.
        await playGame(subject, 'guest', 'alice');
        await failsWith(
          subject.friendsFor('alice').sendRequest(subject.idOf('guest')),
          'NOT_FOUND',
          'alice asks the guest',
        );
        same(await subject.friendsFor('alice').recentPlayers(), [], "alice's recent players");
      },
    },
    {
      name: 'a friend link has a stable token, any case, until a reset',
      run: async (subject) => {
        const alice = subject.friendsFor('alice');
        const bob = subject.friendsFor('bob');
        const token = await alice.myFriendLink();
        same(await alice.myFriendLink(), token, 'the second call');
        check(!token.includes(subject.idOf('alice')), 'the token is not the id');
        same((await alice.openFriendLink(token))?.status, 'self', 'alice opens her own link');
        await failsWith(alice.requestByLink(token), 'BAD_REQUEST', 'alice asks herself');

        const seen = await bob.openFriendLink(token.toLowerCase());
        check(seen !== null, 'bob opens the link in small letters');
        same(seen?.status, 'none', 'the status bob sees');
        same(await bob.openFriendLink('not-a-token'), null, 'text that is no token');
        same(await bob.requestByLink(token), 'sent', 'bob asks by link');
        same(await bob.requestByLink(token), 'sent', 'bob asks again');
        same((await bob.openFriendLink(token))?.status, 'sent', 'the status after the request');

        const fresh = await alice.resetFriendLink();
        check(fresh !== token, 'a reset makes a new token');
        same(await alice.myFriendLink(), fresh, 'the link after the reset');
        same(await subject.friendsFor('carol').openFriendLink(token), null, 'the old link');
        await failsWith(
          subject.friendsFor('carol').requestByLink(token),
          'NOT_FOUND',
          'a request by the old link',
        );
        same(
          await subject.friendsFor('carol').requestByLink(fresh),
          'sent',
          'a request by the new link',
        );
        // The request from before the reset stays.
        same(
          (await alice.listRequests()).incoming.map((row) => row.playerId).sort(),
          [subject.idOf('bob'), subject.idOf('carol')].sort(),
          "alice's incoming requests",
        );
      },
    },
    {
      name: 'an accepted request makes friends both ways; remove ends it both ways',
      run: async (subject) => {
        const alice = subject.friendsFor('alice');
        const bob = subject.friendsFor('bob');
        const aliceId = subject.idOf('alice');
        const bobId = subject.idOf('bob');
        await failsWith(alice.acceptRequest(bobId), 'NOT_FOUND', 'accept with no request');

        same(await bob.requestByLink(await alice.myFriendLink()), 'sent', 'bob asks alice');
        const incoming = (await alice.listRequests()).incoming;
        same(incoming.length, 1, "alice's incoming requests");
        same(incoming[0]?.playerId, bobId, 'the request is from bob');
        check(typeof incoming[0]?.sentAt === 'number', 'sentAt is a number');
        same(
          (await bob.listRequests()).outgoing.map((row) => row.playerId),
          [aliceId],
          'sent',
        );
        same((await alice.listRequests()).outgoing, [], "alice's sent requests");

        await alice.acceptRequest(bobId);
        same(await alice.listRequests(), { incoming: [], outgoing: [] }, "alice's requests");
        same(await bob.listRequests(), { incoming: [], outgoing: [] }, "bob's requests");
        const list = await alice.listFriends();
        same(list.length, 1, "alice's friends");
        same(list[0]?.playerId, bobId, 'bob is her friend');
        same(list[0]?.record, { wins: 0, losses: 0 }, 'no match yet');
        check(typeof list[0]?.since === 'number', 'since is a number');
        same(await friendIds(subject, 'bob'), [aliceId], "bob's friends");
        same(await bob.sendRequest(aliceId), 'friends', 'a request to a friend');

        await bob.removeFriend(aliceId);
        await bob.removeFriend(aliceId);
        same(await alice.listFriends(), [], "alice's friends after remove");
        same(await bob.listFriends(), [], "bob's friends after remove");
        // They met only by link: after the remove, a request by id finds nobody.
        await failsWith(alice.sendRequest(bobId), 'NOT_FOUND', 'alice asks bob by id');
        same(
          await alice.requestByLink(await bob.myFriendLink()),
          'sent',
          'alice asks bob by link after remove',
        );
      },
    },
    {
      name: 'a declined request waits; the decliner may still ask; cancel takes one back',
      run: async (subject) => {
        const alice = subject.friendsFor('alice');
        const bob = subject.friendsFor('bob');
        const aliceId = subject.idOf('alice');
        const bobId = subject.idOf('bob');
        await bob.requestByLink(await alice.myFriendLink());
        await alice.declineRequest(bobId);
        await alice.declineRequest(bobId);
        same(await alice.listRequests(), { incoming: [], outgoing: [] }, 'after the decline');
        same(await bob.listRequests(), { incoming: [], outgoing: [] }, "bob's view");
        await failsWith(bob.sendRequest(aliceId), 'TRY_LATER', 'bob asks again');
        await failsWith(
          bob.requestByLink(await alice.myFriendLink()),
          'TRY_LATER',
          'bob asks again by link',
        );

        same(await alice.sendRequest(bobId), 'sent', 'alice asks bob');
        same(
          (await bob.listRequests()).incoming.map((row) => row.playerId),
          [aliceId],
          'in',
        );
        await alice.cancelRequest(bobId);
        await alice.cancelRequest(bobId);
        same(await bob.listRequests(), { incoming: [], outgoing: [] }, 'after the cancel');
      },
    },
    {
      name: 'two players who ask each other become friends',
      run: async (subject) => {
        const aliceId = subject.idOf('alice');
        const bobId = subject.idOf('bob');
        await playGame(subject, 'alice', 'bob');
        same(await subject.friendsFor('alice').sendRequest(bobId), 'sent', 'alice asks');
        same(await subject.friendsFor('bob').sendRequest(aliceId), 'friends', 'bob asks back');
        same(await friendIds(subject, 'alice'), [bobId], "alice's friends");
        same(await friendIds(subject, 'bob'), [aliceId], "bob's friends");
      },
    },
    {
      name: 'a username search is exact, and a block hides the player',
      run: async (subject) => {
        await setUsername(subject, 'alice', 'Alice_Plays');
        const bob = subject.friendsFor('bob');
        same(
          await bob.findPlayer('alice_plays'),
          { name: { kind: 'username', name: 'Alice_Plays' }, status: 'none' },
          'bob finds alice in small letters',
        );
        same(await bob.findPlayer('Alice'), null, 'a part of the name');
        same(await bob.findPlayer('nobody_here'), null, 'no such name');
        same(
          (await subject.friendsFor('alice').findPlayer('Alice_Plays'))?.status,
          'self',
          'alice finds herself',
        );
        same(await bob.requestByUsername('ALICE_PLAYS'), 'sent', 'bob asks by name');
        await failsWith(
          bob.requestByUsername('nobody_here'),
          'NOT_FOUND',
          'a request to no such name',
        );

        // Alice blocks bob: he cannot find her, as if she had no account.
        await subject.safetyFor('alice').block(subject.idOf('bob'));
        same(await bob.findPlayer('Alice_Plays'), null, 'bob searches after the block');
        await failsWith(
          bob.requestByUsername('Alice_Plays'),
          'NOT_FOUND',
          'bob asks after the block',
        );
        same(
          await subject.friendsFor('alice').findPlayer('nobody_here'),
          null,
          'alice: no such name',
        );
        same(
          await bob.listRequests(),
          { incoming: [], outgoing: [] },
          'the block ends the request',
        );
      },
    },
    {
      name: 'a request by id needs a meeting; recent players list saved opponents',
      run: async (subject) => {
        const alice = subject.friendsFor('alice');
        const aliceId = subject.idOf('alice');
        const bobId = subject.idOf('bob');
        await failsWith(alice.sendRequest(bobId), 'NOT_FOUND', 'alice asks a stranger');
        await failsWith(alice.sendRequest(aliceId), 'BAD_REQUEST', 'alice asks herself');
        await failsWith(alice.sendRequest(''), 'NOT_FOUND', 'an empty id');
        same(await alice.recentPlayers(), [], 'no games yet');

        await playGame(subject, 'alice', 'bob');
        await playGame(subject, 'guest', 'alice');
        const recent = await alice.recentPlayers();
        same(
          recent.map((row) => [row.playerId, row.status]),
          [[bobId, 'none']],
          "alice's recent players",
        );
        check(recent[0]?.name !== null, 'a recent player has a name');
        check(typeof recent[0]?.playedAt === 'number', 'playedAt is a number');
        same(await alice.sendRequest(bobId), 'sent', 'alice asks bob');
        same(
          (await alice.recentPlayers()).map((row) => row.status),
          ['sent'],
          'the status in the list',
        );
        same(
          (await subject.friendsFor('bob').recentPlayers()).map((row) => [
            row.playerId,
            row.status,
          ]),
          [[aliceId, 'received']],
          "bob's recent players",
        );
      },
    },
    {
      name: 'a block ends the friendship and hides the two from each other',
      run: async (subject) => {
        await befriend(subject, 'alice', 'bob');
        await playGame(subject, 'alice', 'bob');
        const aliceId = subject.idOf('alice');
        const bobId = subject.idOf('bob');
        const bobToken = await subject.friendsFor('bob').myFriendLink();

        await subject.safetyFor('bob').block(aliceId);
        same(await subject.friendsFor('alice').listFriends(), [], "alice's friends");
        same(await subject.friendsFor('bob').listFriends(), [], "bob's friends");
        same(await subject.friendsFor('alice').recentPlayers(), [], "alice's recent players");
        same(await subject.friendsFor('bob').recentPlayers(), [], "bob's recent players");
        same(await subject.friendsFor('alice').openFriendLink(bobToken), null, "bob's link");
        await failsWith(
          subject.friendsFor('alice').requestByLink(bobToken),
          'NOT_FOUND',
          'alice asks by link',
        );
        await failsWith(
          subject.friendsFor('alice').sendRequest(bobId),
          'NOT_FOUND',
          'alice asks bob',
        );
        await failsWith(
          subject.friendsFor('bob').sendRequest(aliceId),
          'BLOCKED',
          'bob asks the player he blocks',
        );
        await failsWith(
          subject.friendsFor('alice').inviteFriend(bobId, GAME),
          'NOT_FRIENDS',
          'alice invites bob',
        );

        // After the unblock they may be friends again.
        await subject.safetyFor('bob').unblock(aliceId);
        same(await subject.friendsFor('bob').sendRequest(aliceId), 'sent', 'bob asks again');
      },
    },
    {
      name: 'a friend met only by link may be blocked',
      run: async (subject) => {
        await befriend(subject, 'alice', 'bob');
        await subject.safetyFor('alice').block(subject.idOf('bob'));
        same(
          (await subject.safetyFor('alice').listBlocked()).map((row) => row.playerId),
          [subject.idOf('bob')],
          "alice's blocks",
        );
      },
    },
    {
      name: 'the record counts the matches the two finished, before and after',
      run: async (subject) => {
        const before = await playGame(subject, 'alice', 'bob');
        // Alice resigns: Bob wins the match.
        await subject.gamesFor('alice').resign(before);
        await befriend(subject, 'alice', 'bob');
        const after = await playGame(subject, 'bob', 'alice');
        await subject.gamesFor('bob').resign(after);
        // A match still running does not count.
        await playGame(subject, 'alice', 'bob');
        await subject.settle();
        const [fromAlice] = await subject.friendsFor('alice').listFriends();
        same(fromAlice?.record, { wins: 1, losses: 1 }, "alice's record");
        const another = await playGame(subject, 'carol', 'alice');
        await subject.gamesFor('alice').resign(another);
        const [fromBob] = await subject.friendsFor('bob').listFriends();
        same(fromBob?.record, { wins: 1, losses: 1 }, "bob's record");
        await subject.gamesFor('bob').resign(await playGame(subject, 'bob', 'alice'));
        const [later] = await subject.friendsFor('bob').listFriends();
        same(later?.record, { wins: 1, losses: 2 }, "bob's record after one more");
      },
    },
    {
      name: 'a friend invite is for that friend only',
      run: async (subject) => {
        const alice = subject.friendsFor('alice');
        const bobId = subject.idOf('bob');
        await failsWith(alice.inviteFriend(bobId, GAME), 'NOT_FRIENDS', 'not friends yet');
        await befriend(subject, 'alice', 'bob');
        await failsWith(
          alice.inviteFriend(bobId, { ...GAME, targetPoints: 0 }),
          'BAD_REQUEST',
          'a bad match length',
        );
        const code = await alice.inviteFriend(bobId, GAME);

        const forBob = await subject.friendsFor('bob').listFriendInvites();
        same(
          forBob.map((invite) => invite.code),
          [code],
          "bob's friend invites",
        );
        same(forBob[0]?.from, subject.idOf('alice'), 'from alice');
        check(forBob[0]?.fromName !== null, 'with her name');
        same(await alice.listFriendInvites(), [], "alice's friend invites");
        same(
          (await subject.invitesFor('alice').listMyInvites()).map((invite) => invite.code),
          [code],
          "alice's open invites",
        );
        same((await subject.invitesFor('bob').getInvite(code))?.status, 'open', 'bob reads it');
        same(await subject.invitesFor('carol').getInvite(code), null, 'carol reads it');
        await inviteFailsWith(
          subject.invitesFor('carol').acceptInvite(code),
          'INVITE_NOT_FOUND',
          'carol accepts it',
        );
        await inviteFailsWith(
          subject.invitesFor('carol').declineInvite(code),
          'INVITE_NOT_FOUND',
          'carol declines it',
        );
        const gameId = await subject.invitesFor('bob').acceptInvite(code);
        check(typeof gameId === 'string', 'bob accepts: a game starts');
        same(await subject.friendsFor('bob').listFriendInvites(), [], 'no open friend invite');
      },
    },
    {
      name: 'an account delete takes its friends, requests and link with it',
      run: async (subject) => {
        await befriend(subject, 'alice', 'bob');
        const aliceToken = await subject.friendsFor('alice').myFriendLink();
        await subject.friendsFor('carol').requestByLink(aliceToken);
        await subject.friendsFor('alice').inviteFriend(subject.idOf('bob'), GAME);
        await subject.onlineDataFor('alice').deleteMyData();
        await subject.settle();

        same(await subject.friendsFor('bob').listFriends(), [], "bob's friends");
        same(await subject.friendsFor('bob').listFriendInvites(), [], "bob's friend invites");
        same(
          await subject.friendsFor('carol').listRequests(),
          { incoming: [], outgoing: [] },
          "carol's requests",
        );
        same(await subject.friendsFor('bob').openFriendLink(aliceToken), null, "alice's link");
        await failsWith(
          subject.friendsFor('alice').listFriends(),
          'NOT_SIGNED_IN',
          'the deleted player',
        );
        await failsWith(
          subject.friendsFor('bob').sendRequest(subject.idOf('alice')),
          'NOT_FOUND',
          'a request to the deleted player',
        );
      },
    },
  ];
}
