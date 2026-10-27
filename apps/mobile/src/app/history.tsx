/** Match history (#142): stats and past local matches, from the phone. */
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { HistoryScreen } from '@/features/history/HistoryScreen';
import { useHistory } from '@/features/history/store';
import { newGameHref } from '@/features/match/routes';

export default function HistoryRoute() {
  const { t } = useTranslation();
  const records = useHistory((s) => s.records);
  return (
    <>
      <Stack.Screen options={{ title: t('history.title') }} />
      <HistoryScreen records={records} onPlay={() => router.push(newGameHref('bot'))} />
    </>
  );
}
