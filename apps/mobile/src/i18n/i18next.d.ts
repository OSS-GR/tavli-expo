// Typed translation keys: `t('settings.sound.label')` is checked by TypeScript.
// English is the source of truth for keys; a Jest test checks that el.json matches.
import 'i18next';

import type en from './en.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof en;
    };
  }
}
