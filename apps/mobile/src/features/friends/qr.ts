/**
 * The QR code of a friend link (#406). Pure: the drawing is in
 * `QrCode.tsx`.
 *
 * `qrcode-generator` (MIT, plain JavaScript) makes the modules. Error
 * correction `M` reads well from a phone screen.
 */
import makeQr from 'qrcode-generator';

/** The empty modules around the code that a reader needs (the QR standard asks for 4). */
export const QR_QUIET_ZONE = 4;

/** The modules of the QR code of `text`: `true` is dark. Row by row, square. */
export function qrModules(text: string): readonly (readonly boolean[])[] {
  const qr = makeQr(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  return Array.from({ length: count }, (_, row) =>
    Array.from({ length: count }, (_, col) => qr.isDark(row, col)),
  );
}

/**
 * An SVG path of the dark modules, one unit per module, with the quiet
 * zone around: the code fills a square `size` units wide.
 */
export function qrPath(modules: readonly (readonly boolean[])[]): {
  readonly path: string;
  readonly size: number;
} {
  const parts: string[] = [];
  modules.forEach((line, row) => {
    line.forEach((dark, col) => {
      if (dark) parts.push(`M${col + QR_QUIET_ZONE} ${row + QR_QUIET_ZONE}h1v1h-1z`);
    });
  });
  return { path: parts.join(''), size: modules.length + 2 * QR_QUIET_ZONE };
}
