/**
 * What's new (#471), from Settings → Help and the one-time Home card.
 * Opening it marks every release seen, so the Home card does not show
 * after it.
 */
import { router } from 'expo-router';
import { useEffect } from 'react';

import { WhatsNewScreen } from '@/features/whats-new/WhatsNewScreen';
import { whatsNewSeen } from '@/features/whats-new/seen';

export default function WhatsNewRoute() {
  useEffect(() => whatsNewSeen.markSeen(), []);
  return (
    <WhatsNewScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
    />
  );
}
