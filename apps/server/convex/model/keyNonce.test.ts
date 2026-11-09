import { describe, expect, it } from 'vitest';

import { checkKeyNonce, KEY_NONCE_RANDOM_BYTES, KEY_NONCE_TTL_MS, makeKeyNonce } from './keyNonce';

const SECRET = 'a-test-secret-that-is-long-enough-0123456789';
const random = () => new Uint8Array(KEY_NONCE_RANDOM_BYTES).fill(7);

describe('key nonces (#397)', () => {
  it('a nonce is good until it runs out', async () => {
    const nonce = await makeKeyNonce(SECRET, 1_000, random());
    expect(await checkKeyNonce(SECRET, nonce, 1_000)).toBe(1_000 + KEY_NONCE_TTL_MS);
    expect(await checkKeyNonce(SECRET, nonce, 1_000 + KEY_NONCE_TTL_MS - 1)).not.toBeNull();
    expect(await checkKeyNonce(SECRET, nonce, 1_000 + KEY_NONCE_TTL_MS)).toBeNull();
  });

  it('turns down a nonce from another secret, a changed time or a changed signature', async () => {
    const nonce = await makeKeyNonce(SECRET, 1_000, random());
    expect(
      await checkKeyNonce('another-secret-that-is-long-enough-000000', nonce, 1_000),
    ).toBeNull();
    const [expires, rand, mac] = nonce.split('.') as [string, string, string];
    expect(await checkKeyNonce(SECRET, `${Number(expires) + 1}.${rand}.${mac}`, 1_000)).toBeNull();
    expect(await checkKeyNonce(SECRET, `${expires}.${rand}.${mac.slice(1)}x`, 1_000)).toBeNull();
    for (const bad of ['', 'a.b', 'a.b.c', `${expires}..${mac}`, `${nonce}.more`]) {
      expect(await checkKeyNonce(SECRET, bad, 1_000)).toBeNull();
    }
  });

  it('needs enough random bytes', async () => {
    await expect(makeKeyNonce(SECRET, 0, new Uint8Array(4))).rejects.toThrow();
  });
});
