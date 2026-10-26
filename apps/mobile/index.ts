// App entry. Unistyles must be configured before any screen calls
// `StyleSheet.create`, so it loads before Expo Router (unistyl.es/v3/guides/expo-router).
import './src/theme/unistyles';
import './src/i18n';
import 'expo-router/entry';
