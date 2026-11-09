// Apple's token calls and notices (#398), without Convex. Keys are made
// in the test; no test reaches Apple.

import {
  SignJWT,
  createLocalJWKSet,
  decodeProtectedHeader,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  jwtVerify,
} from 'jose';
import type { CryptoKey, JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import { APPLE_ISSUER } from './appleIdToken';
import {
  APPLE_REVOKE_URL,
  APPLE_TOKEN_URL,
  CLIENT_SECRET_TTL_S,
  appleKeyConfig,
  createAppleTokenClient,
  endsKey,
  makeAppleClientSecret,
  readAppleNotice,
  subjectOfAppleIdToken,
} from './appleTokens';
import type { AppleKeyConfig } from './appleTokens';

const NOW = Date.UTC(2026, 10, 9, 12, 0, 0);

let teamKey: { config: AppleKeyConfig; publicKey: CryptoKey };

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  teamKey = {
    config: {
      teamId: 'TEAM123456',
      keyId: 'KEY1234567',
      privateKey: await exportPKCS8(privateKey),
    },
    publicKey,
  };
});

describe('appleKeyConfig', () => {
  it('reads the three vars, and a key pasted with \\n for its line breaks', () => {
    const pem = '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----';
    const config = appleKeyConfig({
      APPLE_TEAM_ID: ' TEAM ',
      APPLE_KEY_ID: 'KEY',
      APPLE_PRIVATE_KEY: pem.replace(/\n/g, '\\n'),
    });
    expect(config).toEqual({ teamId: 'TEAM', keyId: 'KEY', privateKey: pem });
  });

  it('is null when one is missing', () => {
    expect(appleKeyConfig({ APPLE_TEAM_ID: 'T', APPLE_KEY_ID: 'K' })).toBeNull();
    expect(appleKeyConfig({ APPLE_TEAM_ID: 'T', APPLE_PRIVATE_KEY: 'P' })).toBeNull();
    expect(appleKeyConfig({})).toBeNull();
  });
});

describe('makeAppleClientSecret', () => {
  it('is an ES256 JWT from the team for the app, short-lived, signed with the key', async () => {
    const secret = await makeAppleClientSecret(teamKey.config, 'com.tavlaki', NOW);
    expect(decodeProtectedHeader(secret)).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
    const { payload } = await jwtVerify(secret, teamKey.publicKey, {
      issuer: 'TEAM123456',
      subject: 'com.tavlaki',
      audience: APPLE_ISSUER,
      currentDate: new Date(NOW),
    });
    expect(payload.iat).toBe(NOW / 1000);
    expect(payload.exp).toBe(NOW / 1000 + CLIENT_SECRET_TTL_S);
  });
});

/** A `fetch` that records each call and answers with `reply`. */
function recordingFetch(reply: () => Response | Promise<Response>) {
  const calls: { url: string; form: Record<string, string>; signal: boolean }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      form: Object.fromEntries(new URLSearchParams(String(init?.body ?? ''))),
      signal: init?.signal instanceof AbortSignal,
    });
    return await reply();
  }) as typeof fetch;
  return { calls, fetcher };
}

describe('createAppleTokenClient', () => {
  it('trades a code with a form POST and reads both tokens', async () => {
    const { calls, fetcher } = recordingFetch(() =>
      Response.json({ refresh_token: 'rt', id_token: 'it', access_token: 'at' }),
    );
    const client = createAppleTokenClient(fetcher);
    expect(
      await client.exchangeCode({ clientId: 'com.tavlaki', clientSecret: 'cs', code: 'c1' }),
    ).toEqual({ refreshToken: 'rt', idToken: 'it' });
    expect(calls).toEqual([
      {
        url: APPLE_TOKEN_URL,
        form: {
          client_id: 'com.tavlaki',
          client_secret: 'cs',
          code: 'c1',
          grant_type: 'authorization_code',
        },
        signal: true,
      },
    ]);
  });

  it('gives null for a refusal, a broken reply, a missing token or no network', async () => {
    const call = { clientId: 'com.tavlaki', clientSecret: 'cs', code: 'c1' };
    const replies: (() => Response | Promise<Response>)[] = [
      () => Response.json({ error: 'invalid_grant' }, { status: 400 }),
      () => new Response('not json'),
      () => Response.json({ id_token: 'it' }),
      () => Response.json({ refresh_token: 'rt' }),
      () => Promise.reject(new TypeError('network down')),
    ];
    for (const reply of replies) {
      expect(await createAppleTokenClient(recordingFetch(reply).fetcher).exchangeCode(call)).toBe(
        null,
      );
    }
  });

  it('revokes a refresh token: true only when Apple says 200', async () => {
    const ok = recordingFetch(() => new Response(null, { status: 200 }));
    const call = { clientId: 'com.tavlaki', clientSecret: 'cs', refreshToken: 'rt' };
    expect(await createAppleTokenClient(ok.fetcher).revoke(call)).toBe(true);
    expect(ok.calls[0]).toEqual({
      url: APPLE_REVOKE_URL,
      form: {
        client_id: 'com.tavlaki',
        client_secret: 'cs',
        token: 'rt',
        token_type_hint: 'refresh_token',
      },
      signal: true,
    });
    const no = recordingFetch(() => new Response(null, { status: 400 }));
    expect(await createAppleTokenClient(no.fetcher).revoke(call)).toBe(false);
    const down = recordingFetch(() => Promise.reject(new TypeError('network down')));
    expect(await createAppleTokenClient(down.fetcher).revoke(call)).toBe(false);
  });
});

describe('subjectOfAppleIdToken', () => {
  it('reads sub, or null', () => {
    const unsigned = (claims: object) =>
      `${btoa('{"alg":"none"}')}.${btoa(JSON.stringify(claims)).replace(/=+$/, '')}.`;
    expect(subjectOfAppleIdToken(unsigned({ sub: 's1' }))).toBe('s1');
    expect(subjectOfAppleIdToken(unsigned({ sub: '' }))).toBeNull();
    expect(subjectOfAppleIdToken(unsigned({}))).toBeNull();
    expect(subjectOfAppleIdToken('nope')).toBeNull();
  });
});

describe('readAppleNotice', () => {
  let apple: { privateKey: CryptoKey; jwk: JWK };
  let other: CryptoKey;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    apple = {
      privateKey: pair.privateKey,
      jwk: { ...(await exportJWK(pair.publicKey)), kid: 'k1' },
    };
    other = (await generateKeyPair('RS256')).privateKey;
  });

  const check = () => ({
    audiences: ['com.tavlaki', 'com.tavlaki.signin'],
    keys: createLocalJWKSet({ keys: [apple.jwk] }),
    now: NOW,
  });

  async function notice(
    events: unknown,
    options: { aud?: string; iss?: string; key?: CryptoKey } = {},
  ): Promise<{ payload: string }> {
    const payload = await new SignJWT({ events })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(options.iss ?? APPLE_ISSUER)
      .setAudience(options.aud ?? 'com.tavlaki')
      .setIssuedAt(NOW / 1000)
      .setJti('j1')
      .sign(options.key ?? apple.privateKey);
    return { payload };
  }

  it('reads the type, the sub and the time from the events text', async () => {
    const body = await notice(
      JSON.stringify({ type: 'consent-revoked', sub: 'apple-ann', event_time: NOW - 5 }),
    );
    const read = await readAppleNotice(body, check());
    expect(read).toEqual({ type: 'consent-revoked', sub: 'apple-ann', eventTime: NOW - 5 });
    expect(read !== null && endsKey(read)).toBe(true);
  });

  it('takes an events object too, and a notice with no time', async () => {
    const read = await readAppleNotice(
      await notice({ type: 'account-delete', sub: 'apple-ann' }),
      check(),
    );
    expect(read).toEqual({ type: 'account-delete', sub: 'apple-ann' });
  });

  it('an email notice is read but ends no key', async () => {
    const read = await readAppleNotice(
      await notice(JSON.stringify({ type: 'email-disabled', sub: 'apple-ann', email: 'x@y' })),
      check(),
    );
    expect(read).toEqual({ type: 'email-disabled', sub: 'apple-ann' });
    expect(read !== null && endsKey(read)).toBe(false);
  });

  it('is null for a notice that is not signed by Apple for our app', async () => {
    const events = JSON.stringify({ type: 'consent-revoked', sub: 'apple-ann' });
    for (const body of [
      await notice(events, { key: other }),
      await notice(events, { aud: 'com.other.app' }),
      await notice(events, { iss: 'https://evil.example' }),
      await notice('not json'),
      await notice(JSON.stringify({ type: 'consent-revoked', sub: '' })),
      await notice(JSON.stringify({ type: 'consent-revoked' })),
      { payload: '' },
      { payload: 42 },
      null,
      'text',
    ]) {
      expect(await readAppleNotice(body, check())).toBeNull();
    }
  });
});
