import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const stubs = fileURLToPath(new URL('./test/expoStubs.ts', import.meta.url));

// `legacySession.test.ts` runs the real Expo client. Vitest processes it
// itself, and React Native and the Expo modules it imports are stubs.
export default defineConfig({
  resolve: {
    alias: {
      'react-native': stubs,
      'expo-constants': stubs,
      'expo-linking': stubs,
      'expo-network': stubs,
    },
  },
  test: {
    server: { deps: { inline: ['@better-auth/expo'] } },
  },
});
