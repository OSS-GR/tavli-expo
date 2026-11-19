// SPIKE (#637, phase 0.9): can the Convex runtime make a Web Push message
// (RFC 8291 `aes128gcm` + a VAPID token, RFC 8292) with Web Crypto only?
import { internalAction } from './_generated/server';

const enc = new TextEncoder();
const cat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8),
  );
}

async function keys(uaPublic: Uint8Array, asPublic: Uint8Array, secret: Uint8Array, auth: Uint8Array, salt: Uint8Array) {
  const ikm = await hkdf(auth, secret, cat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  return { cek: await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt', 'decrypt']), nonce };
}

export const test = internalAction({
  args: {},
  handler: async () => {
    const ecdh = { name: 'ECDH', namedCurve: 'P-256' };
    // The browser's side of a subscription.
    const ua = await crypto.subtle.generateKey(ecdh, true, ['deriveBits']);
    const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
    const auth = crypto.getRandomValues(new Uint8Array(16));

    // The server encrypts.
    const as = await crypto.subtle.generateKey(ecdh, true, ['deriveBits']);
    const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
    const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: ua.publicKey }, as.privateKey, 256));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const k = await keys(uaPublic, asPublic, secret, auth, salt);
    const text = JSON.stringify({ title: 'Guest 4821', body: 'Your turn', data: { gameId: 'g1' } });
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv: k.nonce }, k.cek, cat(enc.encode(text), new Uint8Array([2]))),
    );
    const body = cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([65]), asPublic, cipher);

    // The browser decrypts.
    const secret2 = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: as.publicKey }, ua.privateKey, 256));
    const k2 = await keys(uaPublic, body.slice(21, 86), secret2, auth, body.slice(0, 16));
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: k2.nonce }, k2.cek, body.slice(86)));
    const roundTrip = new TextDecoder().decode(plain.slice(0, -1)) === text;

    // The VAPID token: an ES256 JWT.
    const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const claims = b64url(enc.encode(JSON.stringify({ aud: 'https://fcm.googleapis.com', exp: 1800000000, sub: 'mailto:x@example.com' })));
    const sig = new Uint8Array(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, vapid.privateKey, enc.encode(`${head}.${claims}`)),
    );
    const verified = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vapid.publicKey, sig, enc.encode(`${head}.${claims}`));
    return { roundTrip, bodyBytes: body.length, jwtSignatureBytes: sig.length, verified };
  },
});
