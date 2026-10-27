/**
 * Float32 arrays as base64 text, for the net weights.
 *
 * The weights ship inside a `.ts` file as one base64 string. Metro, Vitest
 * and Node all load a `.ts` file with no extra setup (no JSON import, no
 * `fs`). The bytes are little-endian Float32. We do not use `atob` or
 * `Buffer`: they are not in every runtime, and this code is small.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const LOOKUP: Int16Array = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i += 1) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

/** Encodes numbers as little-endian Float32, then base64. */
export function encodeFloat32(values: ArrayLike<number>): string {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < values.length; i += 1) view.setFloat32(i * 4, values[i] ?? 0, true);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += ALPHABET.charAt((n >> 18) & 63) + ALPHABET.charAt((n >> 12) & 63);
    out += i + 1 < bytes.length ? ALPHABET.charAt((n >> 6) & 63) : '=';
    out += i + 2 < bytes.length ? ALPHABET.charAt(n & 63) : '=';
  }
  return out;
}

/** Decodes `encodeFloat32` text. Throws on a bad character or length. */
export function decodeFloat32(text: string): Float32Array {
  const clean = text.replace(/=+$/, '');
  // One base64 character left over holds only 6 bits: no whole byte.
  if (clean.length % 4 === 1) throw new RangeError('base64 text has a bad length');
  const byteLength = Math.floor((clean.length * 3) / 4);
  if (byteLength % 4 !== 0) throw new RangeError('base64 text is not a Float32 array');
  const bytes = new Uint8Array(byteLength);
  let bits = 0;
  let count = 0;
  let at = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const code = clean.charCodeAt(i);
    const value = code < 128 ? (LOOKUP[code] ?? -1) : -1;
    if (value < 0) throw new RangeError(`bad base64 character at ${i}`);
    bits = (bits << 6) | value;
    count += 6;
    if (count >= 8) {
      count -= 8;
      if (at < byteLength) bytes[at] = (bits >> count) & 255;
      at += 1;
    }
  }
  const view = new DataView(bytes.buffer);
  const out = new Float32Array(byteLength / 4);
  for (let i = 0; i < out.length; i += 1) out[i] = view.getFloat32(i * 4, true);
  return out;
}
