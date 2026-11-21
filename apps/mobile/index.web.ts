// App entry for the browser (#669). Metro picks this file on the web.
// Skia on the web is CanvasKit (WebAssembly). It must be loaded before any
// screen draws, so Expo Router starts only after it. Until then the page
// shows a plain loading screen in the app's colors.
import '@expo/metro-runtime';
import './src/features/crash/start';
import './src/theme/unistyles';
import './src/i18n';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

import { showLoading } from './src/web/loading';

const loading = showLoading();

// `canvaskit.wasm` sits at the site root (`tools/copy-canvaskit.mjs`).
LoadSkiaWeb({ locateFile: (file: string) => `/${file}` })
  .then(async () => {
    const [{ App }, { renderRootComponent }] = await Promise.all([
      import('expo-router/build/qualified-entry'),
      import('expo-router/build/renderRootComponent'),
    ]);
    renderRootComponent(App);
    loading.done();
  })
  .catch(() => loading.failed());
