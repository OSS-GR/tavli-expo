// Jest for the Expo app (jest-expo preset + React Native Testing Library).
// Pure packages use Vitest instead. See docs.expo.dev/develop/unit-testing.
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // The Unistyles mocks must load before our Unistyles config (unistyl.es/v3/start/testing).
  setupFiles: ['react-native-unistyles/mocks', '<rootDir>/jest.setup.ts'],
  // pnpm keeps packages in node_modules/.pnpm, so we use Expo's pnpm pattern.
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg))',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/ios/', '/android/'],
};
