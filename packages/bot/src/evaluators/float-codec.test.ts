import { describe, expect, it } from 'vitest';

import { decodeFloat32, encodeFloat32 } from './float-codec';

describe('float codec', () => {
  it('round-trips Float32 values through base64', () => {
    const values = [0, 1, -1, 0.5, 3.25, -1234.5, 1e-7, Math.PI];
    const decoded = decodeFloat32(encodeFloat32(values));
    expect(Array.from(decoded)).toEqual(Array.from(Float32Array.from(values)));
  });

  it('handles every padding length', () => {
    for (let n = 0; n < 7; n += 1) {
      const values = Array.from({ length: n }, (_, i) => i * 0.75 - 2);
      expect(Array.from(decodeFloat32(encodeFloat32(values)))).toEqual(values);
    }
  });

  it('writes little-endian bytes in standard base64', () => {
    // 1.0f = 00 00 80 3f.
    expect(encodeFloat32([1])).toBe('AACAPw==');
    expect(Array.from(decodeFloat32('AACAPw=='))).toEqual([1]);
  });

  it('throws on bad text', () => {
    expect(() => decodeFloat32('AA*A')).toThrow(RangeError);
    expect(() => decodeFloat32('AAA=')).toThrow(RangeError);
  });
});
