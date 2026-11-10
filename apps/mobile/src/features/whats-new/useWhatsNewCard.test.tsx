import { createMemoryStorage } from '@tavli/contracts';
import { act, renderHook } from '@testing-library/react-native';

import { CONSENT_STORAGE_KEY } from '@/features/privacy/consent';

import { createWhatsNewSeen, WHATS_NEW_STORAGE_KEY } from './seen';
import { useWhatsNewCard } from './useWhatsNewCard';

/** A phone that updated from a build with only the older release. */
function updatedPhone() {
  const storage = createMemoryStorage({
    [CONSENT_STORAGE_KEY]: '{"status":"denied"}',
    [WHATS_NEW_STORAGE_KEY]: '2026-11-02',
  });
  return createWhatsNewSeen(storage);
}

describe('useWhatsNewCard (#471)', () => {
  it('shows once after an update, holds the reminders back, and stays seen', async () => {
    const seen = updatedPhone();
    const reminders = { otherPrompt: jest.fn() };
    const { result, rerender } = await renderHook(
      ({ focused }: { focused: boolean }) => useWhatsNewCard({ focused, seen, reminders }),
      { initialProps: { focused: true } },
    );
    expect(result.current.shown).toBe(true);
    expect(seen.due()).toBe(false);
    expect(reminders.otherPrompt).toHaveBeenCalledTimes(1);

    // Home leaves the view, then shows again: no card.
    await rerender({ focused: false });
    expect(result.current.shown).toBe(false);
    await rerender({ focused: true });
    expect(result.current.shown).toBe(false);
    expect(reminders.otherPrompt).toHaveBeenCalledTimes(1);
  });

  it('hide() takes the card away', async () => {
    const seen = updatedPhone();
    const reminders = { otherPrompt: jest.fn() };
    const { result } = await renderHook(() => useWhatsNewCard({ focused: true, seen, reminders }));
    expect(result.current.shown).toBe(true);
    await act(async () => result.current.hide());
    expect(result.current.shown).toBe(false);
  });

  it('shows nothing when nothing is new, or Home is not in view', async () => {
    const reminders = { otherPrompt: jest.fn() };
    const fresh = createWhatsNewSeen(createMemoryStorage());
    const none = await renderHook(() => useWhatsNewCard({ focused: true, seen: fresh, reminders }));
    expect(none.result.current.shown).toBe(false);
    const updated = updatedPhone();
    const away = await renderHook(() =>
      useWhatsNewCard({ focused: false, seen: updated, reminders }),
    );
    expect(away.result.current.shown).toBe(false);
    expect(reminders.otherPrompt).not.toHaveBeenCalled();
  });
});
