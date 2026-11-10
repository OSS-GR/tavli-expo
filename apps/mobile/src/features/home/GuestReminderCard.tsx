/**
 * The guest reminder card (#404) with the player's own numbers (#463):
 * "You have won 3 online matches as a guest." The count comes from the
 * finished online games list (`useMyOnlineGames`, the newest
 * `MAX_LISTED_GAMES`), which the card watches only while it shows. With
 * no win, no list yet or a failed list, the card keeps its usual text.
 * A full list may leave older wins out, so the card says "at least".
 * Nothing new leaves the phone, and no analytics.
 */
import {
  MAX_LISTED_GAMES,
  type AuthProvider,
  type GameSummary,
  type GameTransport,
} from '@tavli/contracts';

import { useMyOnlineGames } from '@/features/online/myGames';

import { ReminderCard, type ReminderCardProps } from './ReminderCard';

/** The finished matches the caller won. */
export function onlineWins(games: readonly GameSummary[]): number {
  return games.filter((game) => game.status === 'finished' && game.winner === game.mySide).length;
}

/** True when the list may leave older games out (the server sends at most `MAX_LISTED_GAMES`). */
export function listMayBeCut(games: readonly GameSummary[]): boolean {
  return games.length >= MAX_LISTED_GAMES;
}

export interface GuestReminderCardProps extends Omit<
  ReminderCardProps,
  'kind' | 'wins' | 'winsAtLeast'
> {
  readonly auth: AuthProvider;
  readonly games: GameTransport;
}

export function GuestReminderCard({ auth, games, ...card }: GuestReminderCardProps) {
  const { state } = useMyOnlineGames(auth, games, 'finished');
  const loaded = state.status === 'loaded';
  const wins = loaded ? onlineWins(state.games) : 0;
  const atLeast = loaded && listMayBeCut(state.games);
  return <ReminderCard kind="guest" wins={wins} winsAtLeast={atLeast} {...card} />;
}
