/**
 * "Your invites" (#314): the open invites of the saved session, live from
 * the server (`Invites.watchMyInvites`), so an inviter who closed the
 * waiting screen can open it again or cancel the invite.
 *
 * The hook makes no account: with no saved session it shows nothing
 * (`useSessionWatch`). The rest is pure: which invites are still open on
 * the phone clock, and the row text. Never send the user id or a code to
 * analytics.
 */
import { INVITE_TIME_MS, type AuthProvider, type InviteView, type Invites } from '@tavli/contracts';
import type { TFunction } from 'i18next';
import { useCallback } from 'react';

import { clockText, clockTickMs } from '@/features/online/clock';
import {
  useSessionWatch,
  type SessionWatchState,
  type StartSessionWatch,
} from '@/features/online/sessionWatch';

/**
 * The newest list, newest invite first. `offset` is the server clock minus
 * the phone clock, as far as the list tells (`inviteClockOffset`).
 */
export interface MyInvitesList {
  readonly invites: readonly InviteView[];
  readonly offset: number;
}

/** The states of `useSessionWatch`: signed out, loading, loaded (`MyInvitesList`) or failed. */
export type MyInvitesState = SessionWatchState<MyInvitesList>;

/**
 * How often the list checks the clock: the time left counts hours, then
 * minutes, like an async turn (`clockTickMs`).
 */
export const INVITE_TICK_MS = clockTickMs('async');

/**
 * The server clock minus the phone clock, as far as a list that arrives
 * at phone time `localNow` tells. Each invite was made `INVITE_TIME_MS`
 * before its `expiresAt`, before the list left the server, so the server
 * clock is at least that far. A phone that runs behind is set right;
 * otherwise the phone clock counts (0), like `clockOffset` of the games.
 */
export function inviteClockOffset(invites: readonly InviteView[], localNow: number): number {
  const newest = Math.max(...invites.map((invite) => invite.expiresAt - INVITE_TIME_MS), localNow);
  return newest - localNow;
}

/**
 * The invites still open at phone time `localNow`. A Convex query does
 * not run again when time passes, and the phone may be offline when the
 * server marks an invite expired, so the phone hides one at its
 * `expiresAt` itself (the server counts it expired from then on too).
 */
export function openInvites(
  invites: readonly InviteView[],
  localNow: number,
  offset: number,
): InviteView[] {
  return invites.filter(
    (invite) => invite.status === 'open' && invite.expiresAt > localNow + offset,
  );
}

export interface InviteRowText {
  /** "Portes · first to 3 points". */
  readonly title: string;
  /** "Live · 23 h left". */
  readonly line: string;
  /** "Code ABCD2345". */
  readonly code: string;
  /** What a screen reader reads for the whole row: "Invite, Portes, first to 3 points, Live, 23 h left". */
  readonly label: string;
}

/** The text of one row at phone time `localNow`. */
export function inviteRowText(
  invite: InviteView,
  t: TFunction,
  localNow: number,
  offset: number,
): InviteRowText {
  const game = t(`games.${invite.choice}`);
  const count = invite.targetPoints;
  const pace = t(invite.pace === 'live' ? 'friend.live' : 'friend.async');
  const left = invite.expiresAt - (localNow + offset);
  const time = t('home.invites.left', { time: clockText(left, 'async', t) });
  return {
    title: t('home.invites.game', { game, count }),
    line: `${pace} · ${time}`,
    code: t('home.invites.code', { code: invite.code }),
    label: [
      t('home.invites.invite'),
      t('home.invites.gameSpoken', { game, count }),
      pace,
      time,
    ].join(', '),
  };
}

/**
 * The open invites of the saved session, live (`useSessionWatch`). It
 * reads the session and follows sign-in and sign-out; it never makes an
 * account.
 */
export function useMyInvites(
  auth: AuthProvider,
  invites: Invites,
  now: () => number = Date.now,
): { readonly state: MyInvitesState; readonly retry: () => void } {
  const start = useCallback<StartSessionWatch<readonly InviteView[]>>(
    (onList, onError) => invites.watchMyInvites(onList, onError),
    [invites],
  );
  const toLoaded = useCallback(
    (list: readonly InviteView[]): MyInvitesList => ({
      invites: list,
      offset: inviteClockOffset(list, now()),
    }),
    [now],
  );
  return useSessionWatch(auth, start, toLoaded);
}
