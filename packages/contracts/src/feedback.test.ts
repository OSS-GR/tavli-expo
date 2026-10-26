import { describe, expect, it } from 'vitest';

import { createNoopFeedback, createRecordingFeedback, gatedFeedback } from './feedback';

describe('feedback', () => {
  it('records calls', () => {
    const feedback = createRecordingFeedback();
    feedback.haptic('light');
    feedback.haptic('success');
    expect(feedback.calls).toEqual(['light', 'success']);
  });

  it('does nothing in the no-op version', () => {
    expect(() => createNoopFeedback().haptic('heavy')).not.toThrow();
  });

  it('passes calls on only while enabled', () => {
    const base = createRecordingFeedback();
    let on = false;
    const gated = gatedFeedback(base, () => on);
    gated.haptic('light');
    on = true;
    gated.haptic('medium');
    expect(base.calls).toEqual(['medium']);
  });
});
