// Runs before each test file, after the Unistyles mocks.
// babel-jest hoists the jest.mock calls below above these imports.

// Same order as the app entry (index.ts): themes first, then i18n.
import './src/theme/unistyles';
import './src/i18n';

// Adapters: in-memory fakes instead of MMKV, expo-haptics, expo-audio and
// Sentry. `feedback` records every haptic, `sound` every sound and
// `crashReporter` every report; dice come from a fixed seed, so tests are
// repeatable.
jest.mock('@/services', () => {
  const {
    createMemoryStorage,
    createRecordingCrashReporter,
    createRecordingFeedback,
    createRecordingSoundPlayer,
  } = jest.requireActual('@tavli/contracts');
  const { createSeededRng } = jest.requireActual('@tavli/engine');
  return {
    storage: createMemoryStorage(),
    feedback: createRecordingFeedback(),
    sound: createRecordingSoundPlayer(),
    crashReporter: createRecordingCrashReporter(),
    createLocalRng: () => createSeededRng(7),
  };
});

// A fixed phone language, so tests do not depend on the machine.
jest.mock('expo-localization', () => {
  const locales = [{ languageCode: 'en', languageTag: 'en-US' }];
  return {
    getLocales: () => locales,
    useLocales: () => locales,
  };
});

// Skia draws with native code. The mock turns every Skia component into a
// plain element, so tests can count what the board draws.
jest.mock('@shopify/react-native-skia', () => jest.requireActual('./test/skiaMock'));

// Reanimated and worklets: small fakes (see test/reanimatedMock.ts).
// Animations finish at once; `scheduleOnRN` calls the function right away.
jest.mock('react-native-reanimated', () => jest.requireActual('./test/reanimatedMock'));
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
  runOnJS:
    (fn: (...args: unknown[]) => void) =>
    (...args: unknown[]) =>
      fn(...args),
}));

// Gesture Handler: a fake that lets tests drive the board's pan gesture
// (`touch()` in test/gestureHandlerMock.tsx).
jest.mock('react-native-gesture-handler', () => jest.requireActual('./test/gestureHandlerMock'));
