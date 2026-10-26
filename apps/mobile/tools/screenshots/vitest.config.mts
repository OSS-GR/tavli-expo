// Renders board screenshots in Node with Skia's headless (CanvasKit) build.
//
//   pnpm --filter @tavli/mobile screenshots
//
// The board scene is plain Skia components with no React Native imports,
// so the same code draws on the phone and here. Output: docs/screenshots/.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '../..');

export default defineConfig({
  root: app,
  resolve: {
    alias: [
      {
        find: /^@shopify\/react-native-skia$/,
        replacement: path.join(
          app,
          'node_modules/@shopify/react-native-skia/lib/commonjs/headless/index.js',
        ),
      },
      { find: /^@\//, replacement: `${path.join(app, 'src')}/` },
    ],
  },
  test: {
    include: ['tools/screenshots/*.shot.tsx'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
