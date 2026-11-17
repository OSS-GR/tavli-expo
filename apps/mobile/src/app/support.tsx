/**
 * Support Tavlaki (#590): `/support?from=settings|ask`, from Settings →
 * Help and the ask card on an end screen. It sends `support_opened` once
 * per open, with where it came from.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { parseSupportSource } from '@/features/match/routes';
import { SupportScreen } from '@/features/support/SupportScreen';
import { sendSupportOpened } from '@/features/support/supportAnalytics';

export default function SupportRoute() {
  const params = useLocalSearchParams<{ from?: string }>();
  const [source] = useState(() => parseSupportSource(params.from));
  useEffect(() => sendSupportOpened(source), [source]);
  return (
    <SupportScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
    />
  );
}
