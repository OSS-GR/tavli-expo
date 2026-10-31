/**
 * "Your invites" (#314): the open invites of the saved session, live from
 * the server (`Invites.watchMyInvites`), so an inviter who closed the
 * waiting screen can open it again or cancel the invite.
 *
 * The hook makes no account: with no saved session it shows nothing
 * (`useSessionWatch`). The rest is pure: the clock offset and the row
 * text. Never send the user id or a code to analytics.
 *
 * The list is the server's: a row stays until the server list drops it
 * (a friend answers, Cancel, or the scheduled `expireInvite` marks it
 * expired; each one changes the row, so the Convex query runs again). The
 * phone clock only gives the time left, so a wrong phone clock can never
 * hide an invite the server still counts as open.
 */
import { INVITE_TIME_MS, type AuthProvider, type InviteView, type Invites } from '@tavli/contracts';
import type { TFunction } from 'i18next';
import { useCallback } from 'react';

import { clockText, clockTickMs, formatTimeLimit } from '@/features/online/clock';
import {
  useSessionWatch,
  type SessionWatchState,
  type StartSessionWatch,
} from '@/features/online/sessionWatch';

/**
 * The newest list, newest invite first. `offset` is the server clock minus
 * the phone clock, as far as the list tells (`inviteClockOffset`).
 * `receivedAt` is the phone time the list came: a clock that has not
 * ticked since is older than that.
 */
export interface MyInvitesList {
  readonly invites: readonly InviteView[];
  readonly offset: number;
  readonly receivedAt: number;
}

/** The states of `useSessionWatch`: signed out, loading, loaded (`MyInvitesList`) or failed. */
export type MyInvitesState = SessionWatchState<MyInvitesList>;

/**
 * How often the list checks the clock: the time left counts hours, then
 * minutes, like a 24-hour turn (`clockTickMs`).
 */
export const INVITE_TICK_MS = clockTickMs(null);

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

export interface InviteRowText {
  /** "Portes · first to 3 points". */
  readonly title: string;
  /** "1 min · 23 h left", or "1 min · Expiring now" once the phone clock says the time is up. */
  readonly line: string;
  /** "Code ABCD2345". */
  readonly code: string;
  /** What a screen reader reads for the whole row: "Invite, Portes, first to 3 points, 1 min, 23 h left". */
  readonly label: string;
}

/**
 * The text of one row at phone time `localNow`. When the time is up on
 * the phone, the row says "Expiring now" until the server list drops it.
 */
export function inviteRowText(
  invite: InviteView,
  t: TFunction,
  localNow: number,
  offset: number,
): InviteRowText {
  const game = t(`games.${invite.choice}`);
  const count = invite.targetPoints;
  const limit = formatTimeLimit(invite.turnTimeMinutes, t);
  const left = invite.expiresAt - (localNow + offset);
  const time =
    left > 0
      ? t('home.invites.left', { time: clockText(left, null, t) })
      : t('home.invites.expiring');
  return {
    title: t('home.invites.game', { game, count }),
    line: `${limit} · ${time}`,
    code: t('home.invites.code', { code: invite.code }),
    label: [
      t('home.invites.invite'),
      t('home.invites.gameSpoken', { game, count }),
      limit,
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
    (list: readonly InviteView[]): MyInvitesList => {
      const receivedAt = now();
      return { invites: list, offset: inviteClockOffset(list, receivedAt), receivedAt };
    },
    [now],
  );
  return useSessionWatch(auth, start, toLoaded);
}
