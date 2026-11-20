/**
 * The pure parts of the friend page (#644): which online games and invites
 * belong to one friend, the rematch setup, and the row texts. No hooks, no
 * React Native.
 */
import type { GameSummary, InviteView, NewInvite, OnlineGameChoice } from '@tavli/contracts';
import type { TFunction } from 'i18next';

import { clockText } from '@/features/online/clock';
import { gameScore } from '@/features/online/gameText';
import { timeLeft } from '@/features/online/timeLeft';

/** The most recent matches the page shows. History has the rest. */
export const FRIEND_RECENT_ROWS = 5;

/** The games with this friend, in the order they came (`yourTurnFirst` or newest first). */
export function gamesWith(games: readonly GameSummary[], playerId: string): GameSummary[] {
  return games.filter((game) => game.opponentId === playerId);
}

/** The open invites this friend sent you. */
export function invitesFrom(invites: readonly InviteView[], playerId: string): InviteView[] {
  return invites.filter((invite) => invite.from === playerId && invite.status === 'open');
}

/**
 * The setup of a rematch: the newest finished friend match (not Play
 * ranked: its time limit is not one a friend invite offers), or `null`.
 */
export function rematchSetup(finished: readonly GameSummary[]): NewInvite | null {
  const last = [...finished]
    .filter((game) => !game.ranked)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (last === undefined) return null;
  return {
    choice: last.choice,
    targetPoints: last.targetPoints,
    turnTimeMinutes: last.turnTimeMinutes,
  };
}

/** The newest change of any finished match, or `null` with none. */
export function lastMatchAt(finished: readonly GameSummary[]): number | null {
  return finished.length === 0 ? null : Math.max(...finished.map((game) => game.updatedAt));
}

/** "Portes · first to 5 points". */
export function gameLine(choice: OnlineGameChoice, targetPoints: number, t: TFunction): string {
  return t('home.invites.game', { game: t(`games.${choice}`), count: targetPoints });
}

export interface ActiveRowText {
  /** "Your turn", "Your friend is playing" or "Invite for you". */
  readonly title: string;
  /** "Portes · first to 5 points · 2–1 · 21 h left". */
  readonly line: string;
  /** What a screen reader reads for the whole row. */
  readonly label: string;
  /** Your turn, or an invite to answer: the title is in the accent color. */
  readonly yours: boolean;
}

/** The row of a game in play at phone time `localNow`. */
export function activeGameText(
  game: GameSummary,
  t: TFunction,
  localNow: number,
  offset: number,
): ActiveRowText {
  const title = game.myTurn ? t('home.online.yourTurn') : t('home.online.waiting');
  const score = gameScore(game, t);
  const left = timeLeft(game, localNow, offset);
  const time =
    left === null
      ? null
      : t('home.online.timeLeft', { time: clockText(left, game.turnTimeMinutes, t) });
  const what = gameLine(game.choice, game.targetPoints, t);
  const line = [what, score.text, time].filter((part) => part !== null).join(' · ');
  const label = [title, what, score.spoken, time].filter((part) => part !== null).join(', ');
  return { title, line, label, yours: game.myTurn };
}

/** The row of an invite from the friend at phone time `localNow`. */
export function inviteText(invite: InviteView, t: TFunction, localNow: number): ActiveRowText {
  const title = t('friends.page.invited');
  const what = gameLine(invite.choice, invite.targetPoints, t);
  const left = invite.expiresAt - localNow;
  const time =
    left > 0
      ? t('home.invites.left', { time: clockText(left, null, t) })
      : t('home.invites.expiring');
  return {
    title,
    line: `${what} · ${time}`,
    label: [title, what, time].join(', '),
    yours: true,
  };
}
