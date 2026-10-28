/**
 * The `Invites` port contract (#256, #281), as plain async checks that
 * work in any test runner (Vitest in packages, Jest in the app).
 *
 *   for (const check of invitesContract()) {
 *     it(check.name, () => check.run(makeSubject()));
 *   }
 *
 * Make a new subject for each check. A check rejects with an `Error` when
 * the adapter breaks the contract. The checks never wait on a real clock:
 * they move the server clock with `subject.passTime`, and wait for the
 * views on their way with `subject.settle`.
 */
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVITE_TIME_MS,
  isInviteErrorData,
} from '../invite';
import type { InviteErrorCode, InviteView, Invites, NewInvite } from '../invite';

/** The game of an invite the checks make. */
export type InvitesContractGame = NewInvite;

/**
 * - `inviter`: the player who makes the invites.
 * - `friend`: a player who answers them.
 * - `other`: a second friend, who comes too late.
 */
export type InvitesContractPlayer = 'inviter' | 'friend' | 'other';

export interface InvitesContractSubject {
  /** The player id of the inviter, as `InviteView.from` shows it. */
  readonly inviterId: string;
  /** The `Invites` of one player. */
  readonly invitesFor: (who: InvitesContractPlayer) => Invites;
  /**
   * Moves the server clock forward by `ms`, and runs what the server does
   * at that time (it marks invites whose time is up `expired`). Never
   * wait on a real clock here.
   */
  readonly passTime: (ms: number) => Promise<void>;
  /** Resolves once every view the server sent so far has reached its watcher. */
  readonly settle: () => Promise<void>;
}

export interface InvitesContractCheck {
  readonly name: string;
  readonly run: (subject: InvitesContractSubject) => Promise<void>;
}

const FEVGA: InvitesContractGame = { choice: 'fevga', targetPoints: 5, pace: 'async' };

function same(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

/** The same code with its last character changed: no invite has it. */
function unknownCode(code: string): string {
  const last = code.slice(-1);
  const swap = INVITE_CODE_ALPHABET.split('').find((char) => char !== last) ?? '2';
  return code.slice(0, -1) + swap;
}

async function viewOf(invites: Invites, code: string): Promise<InviteView> {
  const view = await invites.getInvite(code);
  if (view === null) throw new Error(`getInvite(${code}): no invite`);
  return view;
}

/** Makes an invite as the inviter. Resolves to its code. */
function createFrom(subject: InvitesContractSubject, game: NewInvite = FEVGA): Promise<string> {
  return subject.invitesFor('inviter').createInvite(game);
}

/** Watches `code` and keeps every view and error that arrives. */
function watch(invites: Invites, code: string) {
  const views: (InviteView | null)[] = [];
  const errors: unknown[] = [];
  const stop = invites.watchInvite(
    code,
    (view) => views.push(view),
    (error) => errors.push(error),
  );
  return {
    views,
    errors,
    stop,
    /** The newest view. Throws when none came yet. */
    last(): InviteView | null {
      if (views.length === 0) throw new Error(`watchInvite(${code}): no view yet`);
      return views[views.length - 1] ?? null;
    },
  };
}

/** Watches the open invites of a player and keeps every list and error that arrives. */
function watchList(invites: Invites) {
  const lists: (readonly InviteView[])[] = [];
  const errors: unknown[] = [];
  const stop = invites.watchMyInvites(
    (list) => lists.push(list),
    (error) => errors.push(error),
  );
  return {
    lists,
    errors,
    stop,
    /** The codes of the newest list. Throws when none came yet. */
    codes(): string[] {
      const list = lists[lists.length - 1];
      if (list === undefined) throw new Error('watchMyInvites: no list yet');
      return list.map((view) => view.code);
    },
  };
}

/** Expects `call` to reject with `InviteErrorData` of this code. */
async function rejectsWith(
  call: Promise<unknown>,
  code: InviteErrorCode,
  what: string,
): Promise<void> {
  let failed = false;
  let reason: unknown;
  try {
    await call;
  } catch (error) {
    failed = true;
    reason = error;
  }
  if (!failed) throw new Error(`${what}: expected a ${code} rejection, but the call resolved`);
  if (!isInviteErrorData(reason)) {
    throw new Error(`${what}: the rejection is not InviteErrorData: ${String(reason)}`);
  }
  same(reason.code, code, `${what}: error code`);
}

/** Checks that `code` looks like an invite code. */
function checkCode(code: string): void {
  if (code.length !== INVITE_CODE_LENGTH) throw new Error(`a code of length ${code.length}`);
  for (const char of code) {
    if (!INVITE_CODE_ALPHABET.includes(char)) throw new Error(`a code with ${char}: ${code}`);
  }
}

export function invitesContract(): InvitesContractCheck[] {
  return [
    {
      name: 'getInvite shows an open invite, for the code in any case',
      run: async (subject) => {
        const code = await createFrom(subject);
        const view = await viewOf(subject.invitesFor('friend'), code.toLowerCase());
        same(view.code, code, 'view.code');
        same(view.from, subject.inviterId, 'view.from');
        same(view.choice, FEVGA.choice, 'view.choice');
        same(view.targetPoints, FEVGA.targetPoints, 'view.targetPoints');
        same(view.pace, FEVGA.pace, 'view.pace');
        same(view.status, 'open', 'view.status');
        same(view.gameId, null, 'view.gameId');
        if (typeof view.expiresAt !== 'number') throw new Error('view.expiresAt is not a number');
        same(await viewOf(subject.invitesFor('inviter'), ` ${code} `), view, 'the inviter view');
      },
    },
    {
      name: 'getInvite resolves null for an unknown code and for text that is not a code',
      run: async (subject) => {
        const code = await createFrom(subject);
        const invites = subject.invitesFor('friend');
        same(await invites.getInvite(unknownCode(code)), null, 'an unknown code');
        same(await invites.getInvite('ABC'), null, 'a short code');
        same(await invites.getInvite('ABCD234O'), null, 'a code with an O');
      },
    },
    {
      name: 'acceptInvite resolves with the game id, and the invite shows it',
      run: async (subject) => {
        const code = await createFrom(subject);
        const gameId = await subject.invitesFor('friend').acceptInvite(code.toLowerCase());
        if (typeof gameId !== 'string' || gameId === '') throw new Error('no game id');
        const view = await viewOf(subject.invitesFor('inviter'), code);
        same(view.status, 'accepted', 'status after accept');
        same(view.gameId, gameId, 'gameId after accept');
        await rejectsWith(
          subject.invitesFor('other').acceptInvite(code),
          'INVITE_CLOSED',
          'a second accept',
        );
        await rejectsWith(
          subject.invitesFor('friend').declineInvite(code),
          'INVITE_CLOSED',
          'a decline after accept',
        );
      },
    },
    {
      name: 'declineInvite closes the invite',
      run: async (subject) => {
        const code = await createFrom(subject);
        await subject.invitesFor('friend').declineInvite(code);
        const view = await viewOf(subject.invitesFor('other'), code);
        same(view.status, 'declined', 'status after decline');
        same(view.gameId, null, 'gameId after decline');
        await rejectsWith(
          subject.invitesFor('other').acceptInvite(code),
          'INVITE_CLOSED',
          'an accept after decline',
        );
      },
    },
    {
      name: 'the inviter cannot answer their own invite: OWN_INVITE',
      run: async (subject) => {
        const code = await createFrom(subject);
        const own = subject.invitesFor('inviter');
        await rejectsWith(own.acceptInvite(code), 'OWN_INVITE', 'accept by the inviter');
        await rejectsWith(own.declineInvite(code), 'OWN_INVITE', 'decline by the inviter');
        same((await viewOf(own, code)).status, 'open', 'status after the rejected calls');
      },
    },
    {
      name: 'an unknown code gets INVITE_NOT_FOUND; text that is not a code gets BAD_REQUEST',
      run: async (subject) => {
        const code = await createFrom(subject);
        const invites = subject.invitesFor('friend');
        await rejectsWith(
          invites.acceptInvite(unknownCode(code)),
          'INVITE_NOT_FOUND',
          'accept of an unknown code',
        );
        await rejectsWith(
          invites.declineInvite(unknownCode(code)),
          'INVITE_NOT_FOUND',
          'decline of an unknown code',
        );
        await rejectsWith(invites.acceptInvite('ABC'), 'BAD_REQUEST', 'accept of a short code');
        await rejectsWith(invites.declineInvite('ABCD234O'), 'BAD_REQUEST', 'decline of an O');
      },
    },
    {
      name: 'an invite expires after INVITE_TIME_MS',
      run: async (subject) => {
        const code = await createFrom(subject);
        const invites = subject.invitesFor('friend');
        const before = await viewOf(invites, code);
        await subject.passTime(INVITE_TIME_MS - 1000);
        same((await viewOf(invites, code)).status, 'open', 'status just before the end');
        await subject.passTime(1000);
        const after = await viewOf(invites, code);
        same(after.status, 'expired', 'status at the end');
        same(after.expiresAt, before.expiresAt, 'expiresAt');
        await rejectsWith(invites.acceptInvite(code), 'INVITE_EXPIRED', 'a late accept');
        await rejectsWith(invites.declineInvite(code), 'INVITE_EXPIRED', 'a late decline');
      },
    },
    {
      name: 'a view is a copy: changing it changes nothing on the server',
      run: async (subject) => {
        const code = await createFrom(subject);
        const invites = subject.invitesFor('friend');
        const view = await viewOf(invites, code);
        (view as { status: string }).status = 'accepted';
        same((await viewOf(invites, code)).status, 'open', 'status after a change to a view');
      },
    },
    {
      name: 'createInvite resolves with a new code, and the inviter is the caller',
      run: async (subject) => {
        const invites = subject.invitesFor('inviter');
        const first = await invites.createInvite({
          choice: 'tavli',
          targetPoints: 3,
          pace: 'live',
        });
        const second = await invites.createInvite(FEVGA);
        checkCode(first);
        checkCode(second);
        if (first === second) throw new Error('two invites got the same code');
        const view = await viewOf(subject.invitesFor('friend'), first);
        same(view.from, subject.inviterId, 'view.from');
        same(
          [view.choice, view.targetPoints, view.pace, view.status],
          ['tavli', 3, 'live', 'open'],
          'the new invite',
        );
      },
    },
    {
      name: 'createInvite rejects a bad match length with BAD_REQUEST',
      run: async (subject) => {
        const invites = subject.invitesFor('inviter');
        await rejectsWith(
          invites.createInvite({ ...FEVGA, targetPoints: 0 }),
          'BAD_REQUEST',
          'a match of 0 points',
        );
        await rejectsWith(
          invites.createInvite({ ...FEVGA, targetPoints: 2.5 }),
          'BAD_REQUEST',
          'a match of 2.5 points',
        );
        same(await invites.listMyInvites(), [], 'the invites after the rejected calls');
      },
    },
    {
      name: 'cancelInvite: only the inviter takes back an open invite',
      run: async (subject) => {
        const code = await createFrom(subject);
        const inviter = subject.invitesFor('inviter');
        const friend = subject.invitesFor('friend');
        await rejectsWith(friend.cancelInvite(code), 'NOT_YOUR_INVITE', 'a cancel by the friend');
        await inviter.cancelInvite(code.toLowerCase());
        same((await viewOf(friend, code)).status, 'cancelled', 'status after cancel');
        await rejectsWith(friend.acceptInvite(code), 'INVITE_CLOSED', 'an accept after cancel');
        await rejectsWith(inviter.cancelInvite(code), 'INVITE_CLOSED', 'a second cancel');
        await rejectsWith(
          inviter.cancelInvite(unknownCode(code)),
          'INVITE_NOT_FOUND',
          'a cancel of an unknown code',
        );
        await rejectsWith(inviter.cancelInvite('ABC'), 'BAD_REQUEST', 'a cancel of a short code');
      },
    },
    {
      name: 'cancelInvite after the invite expired gets INVITE_EXPIRED',
      run: async (subject) => {
        const code = await createFrom(subject);
        await subject.passTime(INVITE_TIME_MS);
        await rejectsWith(
          subject.invitesFor('inviter').cancelInvite(code),
          'INVITE_EXPIRED',
          'a late cancel',
        );
      },
    },
    {
      name: 'listMyInvites lists the open invites of the caller, newest first',
      run: async (subject) => {
        const invites = subject.invitesFor('inviter');
        const first = await invites.createInvite(FEVGA);
        await subject.passTime(1000);
        const second = await invites.createInvite({
          choice: 'portes',
          targetPoints: 1,
          pace: 'live',
        });
        await subject.passTime(1000);
        const accepted = await invites.createInvite(FEVGA);
        await subject.passTime(1000);
        const cancelled = await invites.createInvite(FEVGA);
        await subject.invitesFor('friend').createInvite(FEVGA);
        await subject.invitesFor('friend').acceptInvite(accepted);
        await invites.cancelInvite(cancelled);
        const mine = await invites.listMyInvites();
        same(
          mine.map((view) => view.code),
          [second, first],
          'the open invites',
        );
        same(mine[0], await viewOf(invites, second), 'a listed invite');
        same(
          await subject.invitesFor('other').listMyInvites(),
          [],
          'the invites of another player',
        );
        await subject.passTime(INVITE_TIME_MS);
        same(await invites.listMyInvites(), [], 'the invites after they expired');
      },
    },
    {
      name: 'watchInvite sends the invite later, then each change, until it stops',
      run: async (subject) => {
        const code = await createFrom(subject);
        const inviter = subject.invitesFor('inviter');
        const watcher = watch(inviter, code.toLowerCase());
        same(watcher.views.length, 0, 'the views inside watchInvite');
        await subject.settle();
        same(watcher.last(), await viewOf(inviter, code), 'the first view');

        const gameId = await subject.invitesFor('friend').acceptInvite(code);
        await subject.settle();
        same(watcher.last()?.status, 'accepted', 'the status after accept');
        same(watcher.last()?.gameId, gameId, 'the gameId after accept');
        same(watcher.errors, [], 'the errors');

        watcher.stop();
        watcher.stop();
        const seen = watcher.views.length;
        const later = await createFrom(subject);
        await inviter.cancelInvite(later);
        await subject.passTime(INVITE_TIME_MS);
        await subject.settle();
        same(watcher.views.length, seen, 'the views after stop');
      },
    },
    {
      name: 'watchInvite sees a decline, a cancel and the expiry',
      run: async (subject) => {
        const declined = await createFrom(subject);
        const cancelled = await createFrom(subject);
        const expired = await createFrom(subject);
        const watchers = [declined, cancelled, expired].map((code) =>
          watch(subject.invitesFor('inviter'), code),
        );
        await subject.settle();
        await subject.invitesFor('friend').declineInvite(declined);
        await subject.invitesFor('inviter').cancelInvite(cancelled);
        await subject.settle();
        same(
          watchers.map((w) => w.last()?.status),
          ['declined', 'cancelled', 'open'],
          'the statuses after decline and cancel',
        );
        await subject.passTime(INVITE_TIME_MS);
        await subject.settle();
        same(
          watchers.map((w) => w.last()?.status),
          ['declined', 'cancelled', 'expired'],
          'the statuses after the time is up',
        );
        for (const w of watchers) w.stop();
      },
    },
    {
      name: 'watchInvite sends null for an unknown code, and each watcher gets its own copy',
      run: async (subject) => {
        const code = await createFrom(subject);
        const friend = subject.invitesFor('friend');
        const unknown = watch(friend, unknownCode(code));
        const a = watch(friend, code);
        const b = watch(friend, code);
        await subject.settle();
        same(unknown.last(), null, 'the view of an unknown code');
        const view = a.last();
        if (view === null) throw new Error('no view');
        if (view === b.last()) throw new Error('two watchers got the same object');
        (view as { status: string }).status = 'accepted';
        same(b.last()?.status, 'open', 'the view of the other watcher');
        same((await viewOf(friend, code)).status, 'open', 'the status on the server');
        for (const w of [unknown, a, b]) w.stop();
      },
    },
    {
      name: 'watchMyInvites sends the list later, then each change, newest first',
      run: async (subject) => {
        const inviter = subject.invitesFor('inviter');
        const watcher = watchList(inviter);
        same(watcher.lists.length, 0, 'the lists inside watchMyInvites');
        await subject.settle();
        same(watcher.codes(), [], 'the first list');

        const first = await createFrom(subject);
        await subject.settle();
        same(watcher.codes(), [first], 'the list after a new invite');
        same(watcher.lists[watcher.lists.length - 1]?.[0], await viewOf(inviter, first), 'a view');
        await subject.passTime(1000);
        const second = await createFrom(subject, {
          choice: 'portes',
          targetPoints: 1,
          pace: 'live',
        });
        const third = await createFrom(subject);
        await subject.settle();
        same(watcher.codes(), [third, second, first], 'the list after three invites');

        // An answer or a cancel takes an invite off the list.
        await subject.invitesFor('friend').acceptInvite(first);
        await subject.settle();
        same(watcher.codes(), [third, second], 'the list after an accept');
        await subject.invitesFor('friend').declineInvite(second);
        await subject.settle();
        same(watcher.codes(), [third], 'the list after a decline');
        await inviter.cancelInvite(third);
        await subject.settle();
        same(watcher.codes(), [], 'the list after a cancel');

        // The server marks an invite expired: it leaves the list.
        const late = await createFrom(subject);
        await subject.settle();
        same(watcher.codes(), [late], 'the list before the time is up');
        await subject.passTime(INVITE_TIME_MS);
        await subject.settle();
        same(watcher.codes(), [], 'the list after the time is up');
        same(watcher.errors, [], 'the errors');
        watcher.stop();
      },
    },
    {
      name: 'watchMyInvites lists only my own invites, gives copies, and sends nothing after stop',
      run: async (subject) => {
        const inviter = subject.invitesFor('inviter');
        // Stopped at once: not even the first list comes.
        const early = watchList(inviter);
        early.stop();
        const a = watchList(inviter);
        const b = watchList(inviter);
        const friend = watchList(subject.invitesFor('friend'));
        await subject.settle();
        const code = await createFrom(subject);
        await subject.settle();
        same(a.codes(), [code], 'my list');
        same(friend.codes(), [], 'the list of another player');

        const list = a.lists[a.lists.length - 1];
        const view = list?.[0];
        if (list === undefined || view === undefined) throw new Error('no list');
        if (list === b.lists[b.lists.length - 1]) throw new Error('two watchers got the same list');
        (view as { status: string }).status = 'accepted';
        same(b.lists[b.lists.length - 1]?.[0]?.status, 'open', 'the list of the other watcher');
        same((await viewOf(inviter, code)).status, 'open', 'the status on the server');

        a.stop();
        a.stop();
        const seen = a.lists.length;
        await createFrom(subject);
        await subject.settle();
        same(a.lists.length, seen, 'the lists after stop');
        same(b.codes().length, 2, 'the list of the watcher that did not stop');
        same(early.lists.length, 0, 'the lists after a stop in the same tick');
        same([...a.errors, ...b.errors, ...friend.errors, ...early.errors], [], 'the errors');
        b.stop();
        friend.stop();
      },
    },
  ];
}
