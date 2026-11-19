// SPIKE (phase 0, #637): web entry. CanvasKit must load before any screen draws.
import '@expo/metro-runtime';
import './src/features/crash/start';
import './src/theme/unistyles';
import './src/i18n';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

const t0 = performance.now();
LoadSkiaWeb({ locateFile: (file: string) => `/${file}` }).then(() => {
  (globalThis as { __skiaLoadMs?: number }).__skiaLoadMs = performance.now() - t0;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { App } = require('expo-router/build/qualified-entry');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderRootComponent } = require('expo-router/build/renderRootComponent');
  renderRootComponent(App);
});
