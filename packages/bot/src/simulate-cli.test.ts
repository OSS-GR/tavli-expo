import { describe, expect, it } from 'vitest';

import { DEFAULT_SIMULATE_ARGS, parseSimulateArgs, runSimulateCli } from './index';
import type { CliIo } from './index';

function io(): CliIo & { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  let clock = 0;
  return {
    out,
    err,
    log: (text) => out.push(text),
    error: (text) => err.push(text),
    now: () => (clock += 500),
  };
}

describe('simulator command line', () => {
  it('reads the flags', () => {
    expect(parseSimulateArgs([])).toEqual(DEFAULT_SIMULATE_ARGS);
    expect(
      parseSimulateArgs(['--', '--games', '10', '--a', 'easy', '--b', 'hard', '--seed', '3']),
    ).toEqual({ games: 10, a: 'easy', b: 'hard', seed: 3, variant: 'portes' });
    expect(parseSimulateArgs(['--a', 'medium', '--b', 'random'])).toMatchObject({
      a: 'medium',
      b: 'random',
    });
  });

  it('rejects bad flags', () => {
    expect(() => parseSimulateArgs(['--games', '0'])).toThrow('--games');
    expect(() => parseSimulateArgs(['--games'])).toThrow('--games');
    expect(() => parseSimulateArgs(['--a', 'expert'])).toThrow('--a');
    expect(() => parseSimulateArgs(['--fast'])).toThrow('unknown option');
  });

  it('runs a short simulation and prints a report', () => {
    const cli = io();
    expect(runSimulateCli(['--games', '4', '--seed', '9'], cli)).toBe(0);
    const report = cli.out.join('\n');
    expect(report).toContain('portes: 4 games, seed 9');
    expect(report).toContain('illegal turns: 0, failed games: 0');
    expect(report).toContain('time: 0.50 s');
  });

  it('plays an Asodio preset', { timeout: 30_000 }, () => {
    expect(
      parseSimulateArgs(['--variant', 'asodio', '--preset', 'asodio.aceyDeuceyGreek']),
    ).toMatchObject({ variant: 'asodio', preset: 'asodio.aceyDeuceyGreek' });
    const cli = io();
    const argv = ['--variant', 'asodio', '--preset', 'asodio.aceyDeuceyGreek', '--games', '2'];
    expect(runSimulateCli([...argv, '--a', 'random', '--b', 'random'], cli)).toBe(0);
    expect(cli.out.join('\n')).toContain('asodio (asodio.aceyDeuceyGreek): 2 games');
    const wrong = io();
    expect(runSimulateCli(['--variant', 'asodio', '--preset', 'plakoto'], wrong)).toBe(2);
    expect(runSimulateCli(['--preset', 'nope'], io())).toBe(2);
    expect(() => parseSimulateArgs(['--preset'])).toThrow('--preset');
  });

  it('returns 2 for bad input and 1 for failed games', () => {
    const bad = io();
    expect(runSimulateCli(['--variant', 'nope'], bad)).toBe(2);
    expect(bad.err[0]).toContain('nope');
    const help = io();
    expect(runSimulateCli(['--help'], help)).toBe(0);
    expect(help.out[0]).toContain('Usage');
    const failing = io();
    // Asodio has no hard bot yet.
    expect(runSimulateCli(['--games', '1', '--variant', 'asodio', '--b', 'hard'], failing)).toBe(1);
    expect(failing.err[0]).toContain('NOT_IMPLEMENTED');
  });
});
