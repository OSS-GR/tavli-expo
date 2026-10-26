import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useUnistyles } from 'react-native-unistyles';

import { useLanguageSync } from '@/i18n/useLanguageSync';

export default function RootLayout() {
  const { theme } = useUnistyles();
  useLanguageSync();

  return (
    // Gesture Handler needs a root view (the board's drag gesture).
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.text,
          headerShadowVisible: false,
        }}>
        <Stack.Screen name="settings" options={{ headerShown: true }} />
        <Stack.Screen name="rules/[variant]" options={{ headerShown: true }} />
        {/* No swipe back on the board: it would fight the checker drag. */}
        <Stack.Screen name="game/[id]" options={{ gestureEnabled: false }} />
      </Stack>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </GestureHandlerRootView>
  );
}
