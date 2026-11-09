/**
 * Sign-in nonces (#397): the server hands one out, the app passes it to
 * the Apple sheet, and Apple signs it into the id token. The server then
 * checks that the token carries a nonce it made, not too long ago.
 *
 * A nonce is signed, not stored: `<expiresAt>.<random>.<signature>`,
 * where the signature is an HMAC-SHA-256 of the first two parts with the
 * Better Auth secret. So asking for a nonce writes nothing, and nobody
 * can fill a table by asking for many. Only a used nonce is stored
 * (`usedKeyNonces`), so it works once.
 *
 * Pure: no Convex types. `now` and the random bytes are arguments.
 */

/** How long a nonce stays good, ms. The Apple sheet takes seconds. */
export const KEY_NONCE_TTL_MS = 10 * 60 * 1000;

/** The random part, bytes. */
export const KEY_NONCE_RANDOM_BYTES = 16;

/** Text before the signed parts, so this HMAC is never one of another use. */
const PURPOSE = 'tavlaki-key-nonce:';

function base64Url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signature(secret: string, signed: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(PURPOSE + signed));
  return base64Url(new Uint8Array(mac));
}

/** Same text, in time that does not depend on where they differ. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A new nonce that runs out `KEY_NONCE_TTL_MS` after `now`. */
export async function makeKeyNonce(
  secret: string,
  now: number,
  random: Uint8Array,
): Promise<string> {
  if (random.length < KEY_NONCE_RANDOM_BYTES) throw new Error('not enough random bytes');
  const signed = `${now + KEY_NONCE_TTL_MS}.${base64Url(random)}`;
  return `${signed}.${await signature(secret, signed)}`;
}

/**
 * When `nonce` runs out (epoch ms), or `null` when this server did not
 * make it, or it ran out at `now`.
 */
export async function checkKeyNonce(
  secret: string,
  nonce: string,
  now: number,
): Promise<number | null> {
  const parts = nonce.split('.');
  if (parts.length !== 3) return null;
  const [expires, random, mac] = parts as [string, string, string];
  if (!/^\d{1,15}$/.test(expires) || random === '' || mac === '') return null;
  if (!sameText(mac, await signature(secret, `${expires}.${random}`))) return null;
  const expiresAt = Number(expires);
  return expiresAt > now ? expiresAt : null;
}
