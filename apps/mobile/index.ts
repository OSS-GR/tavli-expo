// App entry. Crash reporting starts first, so it sees errors while the app loads.
// Unistyles must be configured before any screen calls
// `StyleSheet.create`, so it loads before Expo Router (unistyl.es/v3/guides/expo-router).
import './src/features/crash/start';
import './src/theme/unistyles';
import './src/i18n';
import 'expo-router/entry';
