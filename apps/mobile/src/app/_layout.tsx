import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useUnistyles } from 'react-native-unistyles';

import { CrashBoundary } from '@/features/crash/CrashBoundary';
import { useLanguageSync } from '@/i18n/useLanguageSync';
import { crashReporter } from '@/services';

function RootStack() {
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
      </Stack>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  // Top-level error boundary: reports render errors and shows a Restart screen.
  return (
    <CrashBoundary reporter={crashReporter}>
      <RootStack />
    </CrashBoundary>
  );
}
