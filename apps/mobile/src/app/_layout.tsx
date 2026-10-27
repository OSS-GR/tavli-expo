import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useUnistyles } from 'react-native-unistyles';

import { useAppAnalytics } from '@/features/analytics/useAppAnalytics';
import { CrashBoundary } from '@/features/crash/CrashBoundary';
import { matchSessions } from '@/features/match/appSessions';
import { useSaveOnBackground } from '@/features/match/useSaveOnBackground';
import { needsWelcome } from '@/features/privacy/consent';
import { useConsent } from '@/features/privacy/consentStore';
import { useLanguageSync } from '@/i18n/useLanguageSync';
import { crashReporter } from '@/services';

function RootStack() {
  const { theme } = useUnistyles();
  useLanguageSync();
  useAppAnalytics();
  useSaveOnBackground(matchSessions.saveNow);
  // First launch (#61): language, then usage data consent, until the user
  // answers. The gate lives here, not on Home, so a deep link or a restored
  // route cannot skip it. The app routes are guarded until the answer; the
  // welcome routes after it. When the guard flips, the router drops the
  // routes that are now guarded, so Back cannot return to the welcome flow.
  const welcome = needsWelcome(useConsent((s) => s.status));

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
        {/* Every app route is listed here, so the welcome gate covers it. */}
        <Stack.Protected guard={!welcome} redirectTo="/welcome/language">
          <Stack.Screen name="index" />
          <Stack.Screen name="new-game" />
          <Stack.Screen name="settings" options={{ headerShown: true }} />
          <Stack.Screen name="history" options={{ headerShown: true }} />
          <Stack.Screen name="rules/[variant]" options={{ headerShown: true }} />
          {/* The tutorial board: no swipe back either (Skip is on screen). */}
          <Stack.Screen name="tutorial" options={{ gestureEnabled: false }} />
          {/* No swipe back on the board: it would fight the checker drag. */}
          <Stack.Screen name="game/[id]/index" options={{ gestureEnabled: false }} />
          <Stack.Screen name="game/[id]/match-end" />
          <Stack.Screen name="dev/board" />
        </Stack.Protected>
        <Stack.Protected guard={welcome} redirectTo="/">
          {/* No swipe back out of the first step before the user answers. */}
          <Stack.Screen name="welcome/language" options={{ gestureEnabled: false }} />
          <Stack.Screen name="welcome/privacy" />
        </Stack.Protected>
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
