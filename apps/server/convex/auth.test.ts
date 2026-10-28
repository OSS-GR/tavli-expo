// Better Auth (#131), run offline with convex-test and the component's
// test helper: a guest signs in through the HTTP routes, and the token's
// subject is the player id the game functions read.

import betterAuthTest from '@convex-dev/better-auth/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';
import { modules } from './test.setup';

function setup() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t);
  return t;
}

beforeEach(() => {
  vi.stubEnv('BETTER_AUTH_SECRET', 'a-test-secret-that-is-long-enough-0123456789');
  vi.stubEnv('CONVEX_SITE_URL', 'http://127.0.0.1:3211');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** The `sub` of a JWT (no signature check: the test only reads it). */
function subjectOf(token: string): string {
  const payload = token.split('.')[1] ?? '';
  const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  return (JSON.parse(json) as { sub: string }).sub;
}

describe('Better Auth routes', () => {
  it('answers on /api/auth', async () => {
    const t = setup();
    const response = await t.fetch('/api/auth/ok');
    expect(response.status).toBe(200);
  });

  it('a guest signs in, and the token subject is the user id', async () => {
    const t = setup();
    const signIn = await t.fetch('/api/auth/sign-in/anonymous', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'tavlaki://' },
      body: '{}',
    });
    expect(signIn.status).toBe(200);
    const body = (await signIn.json()) as { user: { id: string; isAnonymous: boolean } };
    expect(body.user.isAnonymous).toBe(true);
    const cookie = signIn.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/session_token/);

    const tokenResponse = await t.fetch('/api/auth/convex/token', {
      headers: { cookie, origin: 'tavlaki://' },
    });
    expect(tokenResponse.status).toBe(200);
    const { token } = (await tokenResponse.json()) as { token: string };
    expect(subjectOf(token)).toBe(body.user.id);

    // Convex turns a valid token into this identity; the game functions
    // then use the subject as the player id.
    const guest = t.withIdentity({ subject: subjectOf(token) });
    const code = await guest.mutation(api.invites.createInvite, {
      choice: 'portes',
      targetPoints: 3,
      pace: 'live',
    });
    expect((await guest.query(api.invites.getInvite, { code }))?.from).toBe(body.user.id);
  });
});
