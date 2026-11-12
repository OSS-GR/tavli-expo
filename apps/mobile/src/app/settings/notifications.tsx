/**
 * Settings → Turn notifications (#285, #501). A build with no online play
 * has no turn notifications: the page goes back to Settings.
 */
import { Redirect, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { turnPushes } from '@/features/notifications/appTurnPushes';
import { backToSettings } from '@/features/settings/backToSettings';
import { NotificationSettings } from '@/features/settings/SettingsSubPages';

export default function NotificationsRoute() {
  const { t } = useTranslation();
  const pushes = turnPushes();
  if (pushes === undefined) return <Redirect href="/settings" />;
  return (
    <>
      <Stack.Screen options={{ title: t('notifications.settings.label') }} />
      <NotificationSettings pushes={pushes} onBack={backToSettings} />
    </>
  );
}
