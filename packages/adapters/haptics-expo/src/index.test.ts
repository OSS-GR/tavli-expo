import { HAPTIC_STYLES } from '@tavli/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// expo-haptics ships React Native code, which Node cannot load. Replace it
// with fakes that record the calls.
const calls: string[] = [];

vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  impactAsync: (style: string) => {
    calls.push(`impact:${style}`);
    return Promise.resolve();
  },
  notificationAsync: (type: string) => {
    calls.push(`notification:${type}`);
    return type === 'error' ? Promise.reject(new Error('no haptics')) : Promise.resolve();
  },
  selectionAsync: () => {
    calls.push('selection');
    return Promise.resolve();
  },
}));

const { createExpoFeedback } = await import('./index');

describe('createExpoFeedback', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('maps every pattern to expo-haptics', () => {
    const feedback = createExpoFeedback();
    for (const style of HAPTIC_STYLES) feedback.haptic(style);
    expect(calls).toEqual([
      'selection',
      'impact:light',
      'impact:medium',
      'impact:heavy',
      'notification:success',
      'notification:warning',
      'notification:error',
    ]);
  });

  it('never throws when the phone has no haptics', async () => {
    const feedback = createExpoFeedback();
    expect(() => feedback.haptic('error')).not.toThrow();
    // Let the rejected promise settle: it must not surface as an error.
    await Promise.resolve();
    await Promise.resolve();
  });
});
