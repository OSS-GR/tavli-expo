// Writes the golden fixture of the Asodio heuristic (#225). Run it from the
// repo root:
//
//   pnpm --filter @tavli/bot golden:asodio
//
// It saves the scores the heuristic gives now. Run it only when a change of
// the scores is the point (new weights or features), never to make a speed
// change pass: then the fixture must stay as it is.
//
// The positions and the line format are in `src/testing/asodio-golden.ts`.

import {
  GOLDEN_PRESETS,
  GOLDEN_TURN_POSITIONS,
  goldenStates,
  positionLine,
  turnsLine,
} from '../src/testing/asodio-golden';

// The package has no Node types (`"types": []`), so declare the little we use.
declare const console: { log(text: string): void };

interface Fs {
  writeFileSync(path: string, text: string): void;
}
const fsModule = 'node:fs';
const fs = (await import(fsModule)) as Fs;

// pnpm runs package scripts in the package folder.
const TARGET = 'src/evaluators/asodio-heuristic.golden.json';

const fixture: Record<string, { positions: string[]; turns: string[] }> = {};
for (const [preset, seed] of GOLDEN_PRESETS) {
  const states = goldenStates(preset, seed);
  fixture[preset] = {
    positions: states.map(positionLine),
    turns: states.slice(0, GOLDEN_TURN_POSITIONS).map(turnsLine),
  };
  console.log(`${preset}: ${states.length} positions`);
}
fs.writeFileSync(TARGET, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`Wrote ${TARGET}`);
