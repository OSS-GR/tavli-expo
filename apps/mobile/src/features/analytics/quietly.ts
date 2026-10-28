/**
 * Runs an analytics call and drops its errors (#227). Analytics must never
 * break the app: the game store calls it after a move is already played, so
 * an error never fails or undoes the move. The hint (#209), the game review
 * (#215) and the tutorial use it too.
 *
 * Returns what `send` returns, or `undefined` when it throws. The error is
 * logged with `console.warn`.
 */
export function quietly<T>(send: () => T): T | undefined {
  try {
    return send();
  } catch (error) {
    console.warn('analytics failed', error);
    return undefined;
  }
}
