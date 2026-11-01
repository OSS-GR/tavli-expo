/**
 * Match history (#142): stats and past local matches, from the phone, then
 * the finished online matches from the server (#313). The screen draws its
 * own header (#359).
 */
import { router } from 'expo-router';

import { HistoryScreen } from '@/features/history/HistoryScreen';
import { OnlineHistory } from '@/features/history/OnlineHistory';
import { useHistory } from '@/features/history/store';
import { newGameHref } from '@/features/match/routes';
import { auth, games } from '@/services';

export default function HistoryRoute() {
  const records = useHistory((s) => s.records);
  return (
    <HistoryScreen
      records={records}
      onPlay={() => router.push(newGameHref('bot'))}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      online={(onMatches) => <OnlineHistory auth={auth} games={games} onMatches={onMatches} />}
    />
  );
}
