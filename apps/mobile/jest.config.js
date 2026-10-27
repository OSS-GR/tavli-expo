// Jest for the Expo app (jest-expo preset + React Native Testing Library).
// Pure packages use Vitest instead. See docs.expo.dev/develop/unit-testing.
const { transform: presetTransform } = require('jest-expo/jest-preset');

// The app builds with the React Compiler (`experiments.reactCompiler` in
// app.json), but babel-preset-expo only runs it when the caller asks, and
// jest-expo does not ask. So we ask here: tests run the same code as the
// app, and a screen draws only the parts that changed. Without it a test
// that plays a whole game draws the whole board on every tap and is about
// three times slower.
const BABEL = '\\.[jt]sx?$';
const [babelJest, babelOptions] = presetTransform[BABEL];
const transform = {
  ...presetTransform,
  [BABEL]: [
    babelJest,
    { ...babelOptions, caller: { ...babelOptions.caller, supportsReactCompiler: true } },
  ],
};

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  transform,
  // The Unistyles mocks must load before our Unistyles config (unistyl.es/v3/start/testing).
  setupFiles: ['react-native-unistyles/mocks', '<rootDir>/jest.setup.ts'],
  // Resets per-test state that lives in app modules (test/afterEnv.ts).
  setupFilesAfterEnv: ['<rootDir>/test/afterEnv.ts'],
  // pnpm keeps packages in node_modules/.pnpm, so we use Expo's pnpm pattern.
  // `standard-navigation` is ESM that expo-router/testing-library loads.
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|standard-navigation))',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/ios/', '/android/'],
  // The first screen test in a file loads and transforms many modules on its
  // first render. With a cold cache (always on CI) that takes about 5 s, and
  // 15-18 s on a busy machine (`jest --no-cache` with the CPU in use), so a
  // short timeout fails at random. 30 s still catches a test that hangs.
  testTimeout: 30_000,
};
