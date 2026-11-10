/**
 * What's new (#471), from Settings → Help and Home's What's new button.
 * Opening it marks every release seen, so the button's dot goes away.
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
