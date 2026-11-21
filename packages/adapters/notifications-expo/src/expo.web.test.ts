import { describe, expect, it } from 'vitest';

import { createExpoPushNotifications } from './expo.web';

describe('the browser twin of the notifications adapter', () => {
  it('never offers, asks or gives a token, and never throws', async () => {
    const pushes = createExpoPushNotifications({ platform: 'ios', projectId: 'p' });
    expect(pushes.platform).toBe('ios');
    expect(await pushes.permission()).toBe('denied');
    expect(await pushes.requestPermission()).toBe('denied');
    expect(await pushes.getToken()).toBeNull();
    expect(await pushes.lastTap()).toBeNull();
    const calls: string[] = [];
    const offToken = pushes.onTokenChange((t) => calls.push(t));
    const offTap = pushes.onTap(() => calls.push('tap'));
    expect(() => {
      offToken();
      offTap();
    }).not.toThrow();
    expect(calls).toEqual([]);
  });
});
