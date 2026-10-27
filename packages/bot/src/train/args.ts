/**
 * The flag parser of `scripts/train.ts`. Dev only.
 */

/**
 * Parses `--flag value` pairs (a lone `--` is skipped). Throws when a flag
 * has no value, when its value is another flag (`--warm --seed 3`), or on
 * a bare word.
 */
export function parseFlags(argv: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i] ?? '';
    if (flag === '--') continue;
    if (!flag.startsWith('--') || flag.length === 2) throw new Error(`unexpected argument ${flag}`);
    const value = argv[i + 1];
    if (value === undefined || value.trim() === '' || value.startsWith('--')) {
      throw new Error(`${flag} needs a value`);
    }
    out.set(flag.slice(2), value);
    i += 1;
  }
  return out;
}

/** The number in `--key`, or `fallback` when the flag is missing. Throws on text that is not a number. */
export function numberFlag(
  options: ReadonlyMap<string, string>,
  key: string,
  fallback: number,
): number {
  const text = options.get(key);
  if (text === undefined) return fallback;
  const value = Number(text);
  if (text.trim() === '' || !Number.isFinite(value)) {
    throw new Error(`--${key} must be a number, got ${text}`);
  }
  return value;
}
