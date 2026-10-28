/**
 * The `Invites` port contract (#256), as plain async checks that work in
 * any test runner (Vitest in packages, Jest in the app).
 *
 *   for (const check of invitesContract()) {
 *     it(check.name, () => check.run(makeSubject()));
 *   }
 *
 * Make a new subject for each check. A check rejects with an `Error` when
 * the adapter breaks the contract. The checks never wait on a real clock:
 * they move the server clock with `subject.passTime`.
 */
import type { OnlineGameChoice, OnlineGamePace } from '../game-transport';
import { INVITE_CODE_ALPHABET, INVITE_TIME_MS, isInviteErrorData } from '../invite';
import type { InviteErrorCode, InviteView, Invites } from '../invite';

export interface InvitesContractGame {
  readonly choice: OnlineGameChoice;
  readonly targetPoints: number;
  readonly pace: OnlineGamePace;
}

/**
 * - `inviter`: the player who makes the invites.
 * - `friend`: a player who answers them.
 * - `other`: a second friend, who comes too late.
 */
export type InvitesContractPlayer = 'inviter' | 'friend' | 'other';

export interface InvitesContractSubject {
  /** The player id of the inviter, as `InviteView.from` shows it. */
  readonly inviterId: string;
  /** Makes an open invite from the inviter. Resolves to its code. */
  readonly createInvite: (game: InvitesContractGame) => Promise<string>;
  /** The `Invites` of one player. */
  readonly invitesFor: (who: InvitesContractPlayer) => Invites;
  /** Moves the server clock forward by `ms`. Never wait on a real clock here. */
  readonly passTime: (ms: number) => Promise<void>;
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

export function invitesContract(): InvitesContractCheck[] {
  return [
    {
      name: 'getInvite shows an open invite, for the code in any case',
      run: async (subject) => {
        const code = await subject.createInvite(FEVGA);
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
        const code = await subject.createInvite(FEVGA);
        const invites = subject.invitesFor('friend');
        same(await invites.getInvite(unknownCode(code)), null, 'an unknown code');
        same(await invites.getInvite('ABC'), null, 'a short code');
        same(await invites.getInvite('ABCD234O'), null, 'a code with an O');
      },
    },
    {
      name: 'acceptInvite resolves with the game id, and the invite shows it',
      run: async (subject) => {
        const code = await subject.createInvite(FEVGA);
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
        const code = await subject.createInvite(FEVGA);
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
        const code = await subject.createInvite(FEVGA);
        const own = subject.invitesFor('inviter');
        await rejectsWith(own.acceptInvite(code), 'OWN_INVITE', 'accept by the inviter');
        await rejectsWith(own.declineInvite(code), 'OWN_INVITE', 'decline by the inviter');
        same((await viewOf(own, code)).status, 'open', 'status after the rejected calls');
      },
    },
    {
      name: 'an unknown code gets INVITE_NOT_FOUND; text that is not a code gets BAD_REQUEST',
      run: async (subject) => {
        const code = await subject.createInvite(FEVGA);
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
        const code = await subject.createInvite(FEVGA);
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
        const code = await subject.createInvite(FEVGA);
        const invites = subject.invitesFor('friend');
        const view = await viewOf(invites, code);
        (view as { status: string }).status = 'accepted';
        same((await viewOf(invites, code)).status, 'open', 'status after a change to a view');
      },
    },
  ];
}
