/**
 * The language and consent steps on their own (Figma frame 12): the step
 * bars, the language cards and their hints, the two data rows, the privacy
 * policy button, the equal answer buttons and Greek. The flow around them is
 * in `welcomeFlow.test.tsx`.
 */
import { act, screen, userEvent } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { consentStore } from '@/features/privacy/consentStore';
import { PRIVACY_POLICY_URL } from '@/features/privacy/consent';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import { settingsStore } from '@/features/settings/store';
import i18n from '@/i18n';

import { renderWithRoot } from '../../../test/render';

import { boardStepStore } from './boardStepStore';
import { WelcomeConsentScreen } from './WelcomeConsentScreen';
import { WelcomeLanguageScreen } from './WelcomeLanguageScreen';

beforeEach(async () => {
  await act(async () => {
    settingsStore.setState({ ...DEFAULT_SETTINGS });
    consentStore.setState({ status: 'unset' });
    boardStepStore.setState({ status: 'new' });
    await i18n.changeLanguage('en');
  });
});

afterAll(async () => {
  await i18n.changeLanguage('en');
});

describe('WelcomeLanguageScreen', () => {
  it('shows step 1 of 3 and a card per language, each name in its own script', async () => {
    const onContinue = jest.fn();
    await renderWithRoot(<WelcomeLanguageScreen onContinue={onContinue} />);

    expect(screen.getByLabelText('Step 1 of 3')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Choose your language' })).toBeOnTheScreen();
    // The phone's language (English in tests) is picked and says so.
    const english = screen.getByRole('radio', { name: 'English' });
    expect(english).toBeChecked();
    expect(english.props.accessibilityHint).toBe("Your phone's language");
    const greek = screen.getByRole('radio', { name: 'Ελληνικά' });
    expect(greek).not.toBeChecked();
    expect(greek.props.accessibilityHint).toBe('Greek');
    expect(screen.getByText('You can change it later in Settings.')).toBeOnTheScreen();

    await userEvent.setup().press(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('a player who passed the board step before has two steps', async () => {
    await act(async () => boardStepStore.setState({ status: 'done' }));
    await renderWithRoot(<WelcomeLanguageScreen onContinue={jest.fn()} />);
    expect(screen.getByLabelText('Step 1 of 2')).toBeOnTheScreen();
  });

  it('speaks Greek: the hint names the language in Greek, never twice', async () => {
    await act(async () => {
      settingsStore.getState().setSetting('language', 'el');
      await i18n.changeLanguage('el');
    });
    await renderWithRoot(<WelcomeLanguageScreen onContinue={jest.fn()} />);

    expect(screen.getByLabelText('Βήμα 1 από 3')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Διαλέξτε γλώσσα' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Ελληνικά' })).toBeChecked();
    // Greek is not the phone's language here, and its name in Greek reads the same.
    expect(screen.getByRole('radio', { name: 'Ελληνικά' }).props.accessibilityHint).toBeUndefined();
    expect(screen.getByRole('radio', { name: 'English' }).props.accessibilityHint).toBe(
      'Η γλώσσα του κινητού σας',
    );
  });
});

describe('WelcomeConsentScreen', () => {
  it('shows step 2, what we collect and never collect, and the policy as a button', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const onBack = jest.fn();
    await renderWithRoot(<WelcomeConsentScreen onBack={onBack} />);

    expect(screen.getByLabelText('Step 2 of 3')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Help make Tavlaki better' })).toBeOnTheScreen();
    // Each row reads as one item.
    expect(screen.getByLabelText(/^What we collect\. For example: /)).toBeOnTheScreen();
    expect(
      screen.getByLabelText('What we never collect. Your name, your email or your contacts.'),
    ).toBeOnTheScreen();
    expect(
      screen.getByText(/Until you choose, we only send anonymous crash reports\./),
    ).toBeOnTheScreen();

    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Read the privacy policy' }));
    expect(openURL).toHaveBeenCalledWith(PRIVACY_POLICY_URL);
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    openURL.mockRestore();
  });

  it("gives Allow and Don't allow the same look, and saves the answer", async () => {
    const onAnswered = jest.fn();
    await renderWithRoot(<WelcomeConsentScreen onBack={jest.fn()} onAnswered={onAnswered} />);
    const allow = screen.getByRole('button', { name: 'Allow usage data' });
    const deny = screen.getByRole('button', { name: "Don't allow" });
    expect(deny.props.style).toEqual(allow.props.style);

    await userEvent.setup().press(deny);
    expect(consentStore.getState().status).toBe('denied');
    expect(boardStepStore.getState().status).toBe('due');
    expect(onAnswered).toHaveBeenCalledTimes(1);
  });

  it('speaks Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    await renderWithRoot(<WelcomeConsentScreen onBack={jest.fn()} />);
    expect(screen.getByLabelText('Βήμα 2 από 3')).toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: 'Βοηθήστε να γίνει το Ταβλάκι καλύτερο' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Διαβάστε την πολιτική απορρήτου' }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Να επιτρέπεται' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Να μην επιτρέπεται' })).toBeOnTheScreen();
  });
});
