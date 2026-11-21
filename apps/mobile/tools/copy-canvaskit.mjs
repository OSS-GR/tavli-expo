// Copies CanvasKit's WebAssembly file into `public/`, where the web build
// and `expo start --web` serve it from the site root (#669). The file is
// the one that belongs to the installed @shopify/react-native-skia, so the
// two always match. `public/canvaskit.wasm` is not in git (8 MB).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(app, 'package.json'));
const skia = path.dirname(require.resolve('@shopify/react-native-skia/package.json'));
// The `full` build: react-native-skia's JavaScript needs it (the small one fails at start).
const wasm = createRequire(path.join(skia, 'package.json')).resolve(
  'canvaskit-wasm/bin/full/canvaskit.wasm',
);
mkdirSync(path.join(app, 'public'), { recursive: true });
copyFileSync(wasm, path.join(app, 'public', 'canvaskit.wasm'));
console.log(`canvaskit.wasm <- ${path.relative(app, wasm)}`);
