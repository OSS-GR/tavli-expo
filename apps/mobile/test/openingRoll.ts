/**
 * Presses the opening Roll button in a test that plays with `fireEvent`
 * (no clock moves). Just after an opening tie the button waits
 * `OPENING_TIE_WAIT_MS` (#176), so this moves the fake clock first.
 * Without it, a test whose seed rolls a tie presses a disabled button
 * forever.
 */
import { act, fireEvent, screen } from '@testing-library/react-native';

import { OPENING_TIE_WAIT_MS } from '@/features/game/GameScreen';

export async function pressOpeningRoll(): Promise<void> {
  const button = screen.getByTestId('roll-button');
  if (button.props.accessibilityState?.disabled === true) {
    await act(async () => {
      jest.advanceTimersByTime(OPENING_TIE_WAIT_MS);
    });
  }
  await act(async () => {
    fireEvent.press(screen.getByTestId('roll-button'));
  });
}
