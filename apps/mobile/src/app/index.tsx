import { Redirect, router } from 'expo-router';

import { HomeScreen } from '@/features/home/HomeScreen';
import { newGameHref, rulesHref } from '@/features/match/routes';
import { needsWelcome } from '@/features/privacy/consent';
import { useConsent } from '@/features/privacy/consentStore';
import { botLevels } from '@/services';

export default function HomeRoute() {
  const consent = useConsent((s) => s.status);

  // First launch: language, then usage data consent (#61). Shown until answered.
  if (needsWelcome(consent)) return <Redirect href="/welcome/language" />;

  return (
    <HomeScreen
      botLevels={botLevels}
      onNewGame={(mode) => router.push(newGameHref(mode))}
      onSettings={() => router.push('/settings')}
      onHowToPlay={() => router.push(rulesHref('portes'))}
    />
  );
}
