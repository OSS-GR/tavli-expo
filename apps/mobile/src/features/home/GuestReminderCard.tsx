/**
 * The guest reminder card (#404) with the player's own numbers (#463):
 * "You have won 3 online matches as a guest." The count comes from the
 * finished online games list (`useMyOnlineGames`, the newest
 * `MAX_LISTED_GAMES`), which the card watches only while it shows. With
 * no win, no list yet or a failed list, the card keeps its usual text.
 * Nothing new leaves the phone, and no analytics.
 */
import type { AuthProvider, GameSummary, GameTransport } from '@tavli/contracts';

import { useMyOnlineGames } from '@/features/online/myGames';

import { ReminderCard, type ReminderCardProps } from './ReminderCard';

/** The finished matches the caller won. */
export function onlineWins(games: readonly GameSummary[]): number {
  return games.filter((game) => game.status === 'finished' && game.winner === game.mySide).length;
}

export interface GuestReminderCardProps extends Omit<ReminderCardProps, 'kind' | 'wins'> {
  readonly auth: AuthProvider;
  readonly games: GameTransport;
}

export function GuestReminderCard({ auth, games, ...card }: GuestReminderCardProps) {
  const { state } = useMyOnlineGames(auth, games, 'finished');
  const wins = state.status === 'loaded' ? onlineWins(state.games) : 0;
  return <ReminderCard kind="guest" wins={wins} {...card} />;
}
