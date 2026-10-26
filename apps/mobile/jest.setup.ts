// Runs before each test file, after the Unistyles mocks.
// babel-jest hoists the jest.mock calls below above these imports.

// Same order as the app entry (index.ts): themes first, then i18n.
import './src/theme/unistyles';
import './src/i18n';

// Adapters: in-memory fakes instead of MMKV, expo-haptics and PostHog.
// `feedback` records every haptic and `analytics` every event it would send
// (it follows the opt-in rules); dice come from a fixed seed, so tests are repeatable.
jest.mock('@/services', () => {
  const { createMemoryStorage, createRecordingAnalytics, createRecordingFeedback } =
    jest.requireActual('@tavli/contracts');
  const { createSeededRng } = jest.requireActual('@tavli/engine');
  return {
    storage: createMemoryStorage(),
    feedback: createRecordingFeedback(),
    analytics: createRecordingAnalytics(),
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
