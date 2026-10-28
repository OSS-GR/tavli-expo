// Writes `convex/_generated/` with no Convex account and no keys (#131).
//
// The app uses a Convex component (Better Auth), so codegen needs a
// backend that analyses the push. This script runs Convex's local backend
// once (`convex dev --once` in anonymous agent mode). The first run
// downloads the backend binary from the Convex GitHub releases. The local
// data lives in `.convex/` (ignored by git).
//
// It never touches a cloud deployment: it forces the anonymous local
// deployment and hides any deploy key. `convex dev` also writes
// `.env.local` and `convex/tsconfig.json`; the script puts back the files
// that were there before (or removes them).
//
// See "Codegen" in docs/architecture/online-game-service.md.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Files `convex dev` writes that are not ours to change.
const touched = [join(root, '.env.local'), join(root, 'convex', 'tsconfig.json')];
const convexDir = dirname(createRequire(import.meta.url).resolve('convex/package.json'));
const cli = join(convexDir, 'bin', 'main.js');

const env = {
  ...process.env,
  CONVEX_AGENT_MODE: 'anonymous',
  CONVEX_DEPLOYMENT: 'anonymous:anonymous-agent',
};
delete env.CONVEX_DEPLOY_KEY;
delete env.CONVEX_SELF_HOSTED_URL;
delete env.CONVEX_SELF_HOSTED_ADMIN_KEY;

const saved = touched.map((file) => (existsSync(file) ? readFileSync(file, 'utf8') : null));
let status = 1;
try {
  const result = spawnSync(
    process.execPath,
    [cli, 'dev', '--once', '--typecheck', 'disable', '--tail-logs', 'disable'],
    { cwd: root, env, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  status = result.status ?? 1;
} finally {
  touched.forEach((file, i) => {
    const before = saved[i];
    if (before === null || before === undefined) rmSync(file, { force: true });
    else writeFileSync(file, before);
  });
}
process.exit(status);
