import { describe, expect, it } from 'vitest';

import { PUSH_ERROR_CODES, createRecordingPushProvider, isPushErrorCode } from './push';
import type { PushProviderContractSubject } from './testing';
import { pushProviderContract } from './testing';

const DEAD = 'dead-token';

function subject(): PushProviderContractSubject {
  return {
    push: createRecordingPushProvider([DEAD]),
    token: (i) => `token-${i}`,
    deadToken: DEAD,
  };
}

describe('createRecordingPushProvider: PushProvider contract', () => {
  for (const check of pushProviderContract()) {
    it(check.name, () => check.run(subject()));
  }
});

describe('createRecordingPushProvider', () => {
  const message = { to: 'a', title: 'Your turn', body: 'Play', data: { gameId: 'g1' } };

  it('records every message, in order, and clears', async () => {
    const push = createRecordingPushProvider();
    await push.send([message, { ...message, to: 'b' }]);
    expect(push.sent.map((m) => m.to)).toEqual(['a', 'b']);
    push.clear();
    expect(push.sent).toEqual([]);
  });

  it('answers DeviceNotRegistered for a killed token', async () => {
    const push = createRecordingPushProvider();
    push.kill('a');
    expect(await push.send([message, { ...message, to: 'b' }])).toEqual([
      { ok: false, error: 'DeviceNotRegistered', message: 'the token is not registered' },
      { ok: true },
    ]);
  });

  it('fails a token with an error until it is revived', async () => {
    const push = createRecordingPushProvider(['b']);
    push.fail('a');
    push.fail('c', 'MessageRateExceeded');
    const three = [message, { ...message, to: 'b' }, { ...message, to: 'c' }];
    expect(await push.send(three)).toEqual([
      { ok: false, error: 'Failed', message: 'the push failed' },
      { ok: false, error: 'DeviceNotRegistered', message: 'the token is not registered' },
      { ok: false, error: 'MessageRateExceeded', message: 'too many pushes to this device' },
    ]);
    push.revive('a');
    push.revive('b');
    expect((await push.send(three)).map((result) => result.ok)).toEqual([true, true, false]);
  });
});

describe('isPushErrorCode', () => {
  it('knows every code and nothing else', () => {
    for (const code of PUSH_ERROR_CODES) expect(isPushErrorCode(code)).toBe(true);
    expect(isPushErrorCode('NotACode')).toBe(false);
    expect(isPushErrorCode(undefined)).toBe(false);
  });
});

describe('pushProviderContract', () => {
  const check = pushProviderContract().find((c) => c.name.startsWith('gives one ok'));

  it('fails a provider that rejects', async () => {
    const push = { send: () => Promise.reject(new Error('down')) };
    await expect(check?.run({ ...subject(), push })).rejects.toThrow('send rejected');
  });

  it('fails a provider that drops a result', async () => {
    const push = { send: () => Promise.resolve([{ ok: true as const }]) };
    await expect(check?.run({ ...subject(), push })).rejects.toThrow('the results');
  });

  it('fails a provider whose broken service still sends', async () => {
    const broken = pushProviderContract().find((c) => c.name.startsWith('a broken service'));
    const subjectWithBroken = { ...subject(), broken: createRecordingPushProvider() };
    await expect(broken?.run(subjectWithBroken)).rejects.toThrow('a result is ok');
  });
});
