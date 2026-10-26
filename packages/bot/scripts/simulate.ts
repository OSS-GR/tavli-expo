// Bot-vs-bot simulator. Run it from the repo root:
//
//   pnpm --filter @tavli/bot simulate -- --games 1000 --a easy --b easy
//
// All the logic is in `src/simulate-cli.ts`. This file only connects it to Node.

import { runSimulateCli } from '../src/simulate-cli';

// The package has no Node types (`"types": []`), so declare the little we use.
declare const process: { readonly argv: readonly string[]; exitCode?: number };
declare const console: { log(text: string): void; error(text: string): void };

process.exitCode = runSimulateCli(process.argv.slice(2), {
  log: (text) => console.log(text),
  error: (text) => console.error(text),
  now: () => Date.now(),
});
