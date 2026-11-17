import type { SentAnalytics } from '@tavli/contracts';
import { act, screen, userEvent } from '@testing-library/react-native';
import { Linking, Share } from 'react-native';

import i18n from '@/i18n';
import { analytics } from '@/services';

import { SupportScreen } from './SupportScreen';

import { renderWithRoot } from '../../../test/render';

const recorded = analytics as unknown as { sent: SentAnalytics[] };

let open: jest.SpyInstance;

beforeEach(() => {
  open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  recorded.sent.length = 0;
  analytics.optIn();
});

afterEach(async () => {
  jest.restoreAllMocks();
  analytics.optOut();
  recorded.sent.length = 0;
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

describe('<SupportScreen />', () => {
  it('shows the text and opens tavlaki.com/support in the browser', async () => {
    const user = userEvent.setup();
    const onBack = jest.fn();
    await renderWithRoot(<SupportScreen onBack={onBack} />);

    expect(screen.getByRole('header', { name: 'Support Tavlaki' })).toBeOnTheScreen();
    expect(screen.getByText('Other ways to help')).toBeOnTheScreen();

    await user.press(screen.getByTestId('support-kofi-button'));
    expect(open).toHaveBeenCalledWith('https://tavlaki.com/support/');
    expect(recorded.sent).toEqual([{ type: 'track', event: 'support_link_opened', props: {} }]);

    await user.press(screen.getByTestId('support-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('opens the Greek page in Greek', async () => {
    const user = userEvent.setup();
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await renderWithRoot(<SupportScreen onBack={jest.fn()} />);
    expect(screen.getByRole('header', { name: 'Στήριξε το Ταβλάκι' })).toBeOnTheScreen();
    await user.press(screen.getByTestId('support-kofi-button'));
    expect(open).toHaveBeenCalledWith('https://tavlaki.com/el/support/');
  });

  it('rates the app in the store and shares the homepage', async () => {
    const user = userEvent.setup();
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await renderWithRoot(<SupportScreen onBack={jest.fn()} />);

    await user.press(screen.getByTestId('support-rate'));
    expect(open).toHaveBeenCalledWith(
      'https://apps.apple.com/app/id6828172932?action=write-review',
    );

    await user.press(screen.getByTestId('support-share'));
    expect(share).toHaveBeenCalledWith({
      message: expect.stringContaining('https://tavlaki.com'),
    });
  });
});
