/**
 * The anonymous install id check, shared by analytics (#61) and crash
 * reports (#43).
 *
 * Merge note: #43 defines the same function in `crash-reporter.ts`. When
 * both land, keep one copy and export it once from `index.ts`.
 */

/**
 * True for a random install id: 8 to 64 letters, digits, `-` or `_`.
 * This rejects emails, names with spaces and other personal data.
 */
export function isAnonymousInstallId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);
}
