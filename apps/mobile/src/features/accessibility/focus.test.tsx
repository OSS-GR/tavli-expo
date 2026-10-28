import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';

import { useFocusOnShow } from './focus';

function Card({ active, titled }: { active: boolean; titled: boolean }) {
  const titleRef = useFocusOnShow(active);
  return titled ? <Text ref={titleRef}>Title</Text> : null;
}

describe('useFocusOnShow', () => {
  it('focuses the title once, when it is active and the title is there', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    await render(<Card active={false} titled />);
    expect(focus).not.toHaveBeenCalled();
    // Active, but the title is not there yet: it gets focus once it shows.
    await screen.rerender(<Card active titled={false} />);
    expect(focus).not.toHaveBeenCalled();
    await screen.rerender(<Card active titled />);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenLastCalledWith(expect.anything(), 'focus');
    await screen.rerender(<Card active titled />);
    expect(focus).toHaveBeenCalledTimes(1);
    focus.mockRestore();
  });
});
