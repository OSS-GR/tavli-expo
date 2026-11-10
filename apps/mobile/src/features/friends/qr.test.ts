import { QR_QUIET_ZONE, qrModules, qrPath } from './qr';

describe('the friend link QR code (#406)', () => {
  it('makes a square code with the three finder squares', () => {
    const modules = qrModules('tavlaki://add/ABCDEFGH23456789');
    const count = modules.length;
    // Version 2 (25 modules) or more: the link is 30 characters.
    expect(count).toBeGreaterThanOrEqual(25);
    for (const line of modules) expect(line).toHaveLength(count);
    // The finder squares: a dark 7 × 7 frame at three corners.
    for (const [row, col] of [
      [0, 0],
      [0, count - 7],
      [count - 7, 0],
    ] as const) {
      for (let i = 0; i < 7; i += 1) {
        expect(modules[row]![col + i]).toBe(true);
        expect(modules[row + 6]![col + i]).toBe(true);
        expect(modules[row + i]![col]).toBe(true);
        expect(modules[row + i]![col + 6]).toBe(true);
      }
      expect(modules[row + 1]![col + 1]).toBe(false);
    }
  });

  it('draws one square per dark module, inside the quiet zone', () => {
    const modules = [
      [true, false],
      [false, true],
    ];
    const { path, size } = qrPath(modules);
    expect(size).toBe(2 + 2 * QR_QUIET_ZONE);
    expect(path).toBe(
      `M${QR_QUIET_ZONE} ${QR_QUIET_ZONE}h1v1h-1zM${QR_QUIET_ZONE + 1} ${QR_QUIET_ZONE + 1}h1v1h-1z`,
    );
  });
});
