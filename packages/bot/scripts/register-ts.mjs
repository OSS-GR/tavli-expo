// Lets Node run this repo's TypeScript source with no build step and no extra
// dependency. Node (22.18+) strips the types by itself. Our source uses
// imports without a file extension (`./simulate`), which Node does not
// resolve, so this hook tries `.ts` and `/index.ts`.
//
// Use: node --import ./scripts/register-ts.mjs ./scripts/simulate.ts

import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { URL, fileURLToPath } from 'node:url';

const HAS_EXTENSION = /\.[cm]?[jt]sx?$|\.json$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    if (relative && !HAS_EXTENSION.test(specifier) && context.parentURL?.startsWith('file:')) {
      for (const suffix of ['.ts', '/index.ts']) {
        const url = new URL(specifier + suffix, context.parentURL);
        if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
