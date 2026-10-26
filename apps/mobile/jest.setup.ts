// Runs before each test file, after the Unistyles mocks.
// babel-jest hoists the jest.mock calls below above these imports.

// Same order as the app entry (index.ts): themes first, then i18n.
import './src/theme/unistyles';
import './src/i18n';

// Adapters: in-memory fakes instead of MMKV.
jest.mock('@/services', () => {
  const { createMemoryStorage } = jest.requireActual('@tavli/contracts');
  return { storage: createMemoryStorage() };
});

// A fixed phone language, so tests do not depend on the machine.
jest.mock('expo-localization', () => {
  const locales = [{ languageCode: 'en', languageTag: 'en-US' }];
  return {
    getLocales: () => locales,
    useLocales: () => locales,
  };
});
