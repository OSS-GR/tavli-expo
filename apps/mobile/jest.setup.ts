// Runs before each test file, after the Unistyles mocks.
// babel-jest hoists the jest.mock calls below above these imports.

// Same order as the app entry (index.ts): themes first, then i18n.
import './src/theme/unistyles';
import './src/i18n';

// Adapters: in-memory fakes instead of MMKV, expo-haptics, expo-audio,
// Sentry and PostHog. `feedback` records every haptic, `sound` every sound,
// `crashReporter` every report and `analytics` every event it would send
// (it follows the opt-in rules); dice come from a fixed seed, so tests are
// repeatable. The bot is the real inline runner (it is pure TypeScript).
jest.mock('@/services', () => {
  const {
    createMemoryStorage,
    createRecordingAnalytics,
    createRecordingCrashReporter,
    createRecordingFeedback,
    createRecordingSoundPlayer,
  } = jest.requireActual('@tavli/contracts');
  const { createSeededRng } = jest.requireActual('@tavli/engine');
  const { InlineBotRunner, createBot } = jest.requireActual('@tavli/bot');
  const { botLevelsByGame } = jest.requireActual('@/features/bot/levels');
  const bot = createBot();
  return {
    storage: createMemoryStorage(),
    feedback: createRecordingFeedback(),
    sound: createRecordingSoundPlayer(),
    crashReporter: createRecordingCrashReporter(),
    analytics: createRecordingAnalytics(),
    createLocalRng: () => createSeededRng(7),
    botRunner: new InlineBotRunner(bot),
    botLevels: botLevelsByGame(bot),
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

// React Native's Jest setup makes `performance.now` a `jest.fn`. React calls
// it several times per render, and a mock keeps every call. A test that
// plays a whole game renders thousands of times, so the list grows to
// millions of entries and the garbage collector slows the test down a lot.
// A plain function reads the same clock (and fake timers still replace it).
globalThis.performance.now = () => Date.now();
