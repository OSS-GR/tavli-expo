import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useUnistyles } from 'react-native-unistyles';

import { useAppAnalytics } from '@/features/analytics/useAppAnalytics';
import { useLanguageSync } from '@/i18n/useLanguageSync';

export default function RootLayout() {
  const { theme } = useUnistyles();
  useLanguageSync();
  useAppAnalytics();

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerShadowVisible: false,
        }}>
        <Stack.Screen name="settings" options={{ headerShown: true }} />
        {/* First launch (#61): no swipe back to Home before the user answers. */}
        <Stack.Screen name="welcome/language" options={{ gestureEnabled: false }} />
      </Stack>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </>
  );
}
