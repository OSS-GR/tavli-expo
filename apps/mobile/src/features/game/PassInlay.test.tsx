/**
 * The pass inlay runs its own timer (#613): it closes only while it is in
 * view and running, so a pass under a card is never closed unseen.
 */
import { act, fireEvent, screen } from '@testing-library/react-native';

import { runOnFakeTimers } from '../../../test/clock';
import { renderWithRoot } from '../../../test/render';

import { PassInlay } from './PassInlay';

runOnFakeTimers();

async function show(running: boolean, onClose: () => void) {
  await renderWithRoot(
    <PassInlay
      title="No moves"
      line="Bot rolled 6-6 · Your turn"
      spoken="No moves. Bot rolled 6-6. Your turn"
      closeLabel="Close"
      announceKey="test:pass"
      durationMs={2000}
      running={running}
      onClose={onClose}
    />,
  );
}

describe('<PassInlay /> (#613)', () => {
  it('closes after its time while running', async () => {
    const onClose = jest.fn();
    await show(true, onClose);
    await act(async () => {
      jest.advanceTimersByTime(1990);
    });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(20);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('waits while not running (paused, or a screen reader)', async () => {
    const onClose = jest.fn();
    await show(false, onClose);
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(screen.getByTestId('pass-inlay-cover'));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
