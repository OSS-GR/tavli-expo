/**
 * The email code step (#433) in the sign-in choices: the address, the
 * code (typed, pasted or filled in by the phone), a wrong or used code,
 * a new code after the wait, a new address, the server's limits, screen
 * readers and Greek. The in-memory provider keeps the "sent" codes; no
 * mail goes out.
 */
import {
  TERMS_VERSION,
  createMemoryAppleSheet,
  createMemoryAuthProvider,
  createMemoryAuthStore,
  createRecordingAnalytics,
  type AuthErrorData,
  type AuthProvider,
  type AuthUser,
  type MemoryAuthStore,
  type Usernames,
} from '@tavli/contracts';
import { createSeededRng } from '@tavli/engine';
import { createMemoryGameServer, type MemoryGameServer } from '@tavli/online';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { reminders } from '@/features/reminders/reminders';
import i18n from '@/i18n';

import { runOnFakeTimers, setupUser } from '../../../test/clock';
import { enterEmailCode, newestCode, sendEmailCode } from '../../../test/emailCode';
import { renderWithRoot } from '../../../test/render';

import { codeDigits, codeLanguage, resendSecondsLeft, RESEND_WAIT_MS } from './emailCode';
import { SignInChoices } from './SignInChoices';

runOnFakeTimers();

let store: MemoryAuthStore;
let auth: AuthProvider;
let server: MemoryGameServer;
let announce: jest.SpyInstance;
let focus: jest.SpyInstance;

beforeEach(() => {
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
  store = createMemoryAuthStore();
  auth = createMemoryAuthProvider(store);
  server = createMemoryGameServer({ rng: createSeededRng(1), now: () => Date.UTC(2026, 10, 9) });
});

afterEach(async () => {
  jest.restoreAllMocks();
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

async function open(options: { auth?: AuthProvider; usernames?: Usernames } = {}) {
  const onSignedIn = jest.fn<void, [AuthUser]>();
  const onNotNow = jest.fn();
  const analytics = createRecordingAnalytics();
  analytics.optIn();
  await renderWithRoot(
    <SignInChoices
      auth={options.auth ?? auth}
      onSignedIn={onSignedIn}
      onNotNow={onNotNow}
      appleSheet={createMemoryAppleSheet()}
      analytics={analytics}
      usernames={options.usernames}
    />,
  );
  return { onSignedIn, onNotNow, analytics };
}

async function openEmail(user: ReturnType<typeof setupUser>, options = {}) {
  const opened = await open(options);
  await user.press(await screen.findByRole('button', { name: 'Continue with email' }));
  return opened;
}

describe('the email code step', () => {
  it('sits under Apple’s button', async () => {
    await open();
    const email = await screen.findByRole('button', { name: 'Continue with email' });
    expect(await screen.findByTestId('sign-in-apple')).toBeOnTheScreen();
    expect(
      screen.getByText(
        'With an email code you can sign in again on any phone. We keep your email address for the sign-in. Other players never see it.',
      ),
    ).toBeOnTheScreen();
    expect(email).toBeOnTheScreen();
  });

  it('signs in with the code from the email', async () => {
    const user = setupUser();
    const { onSignedIn, analytics } = await openEmail(user);
    expect(await screen.findByRole('header', { name: 'Sign in with email' })).toBeOnTheScreen();
    await sendEmailCode(user, ' Eleni@Example.com ');
    expect(store.sentEmailCodes).toEqual([
      { email: 'eleni@example.com', code: '100001', language: 'en' },
    ]);
    expect(screen.getByRole('header', { name: 'Check your email' })).toBeOnTheScreen();
    expect(
      screen.getByText(
        'We sent a 6-digit code to eleni@example.com. It works for 5 minutes. If it does not come, check the spam folder.',
      ),
    ).toBeOnTheScreen();
    // Six digits check the code at once.
    await user.type(screen.getByTestId('email-code-input'), '100001');
    expect(onSignedIn).toHaveBeenCalledWith({ id: 'user-1', isGuest: false });
    expect(store.keys).toEqual({ 'email:eleni@example.com': 'user-1' });
    expect(reminders.state().stopped).toBe(true);
    expect(analytics.sent).toEqual([
      { type: 'track', event: 'online_sign_in', props: { method: 'email' } },
    ]);
    expect(JSON.stringify(analytics.sent)).not.toMatch(/eleni|example|100001/i);
  });

  it('a new saved account gets the username step after the code', async () => {
    const user = setupUser();
    const { onSignedIn } = await openEmail(user, {
      usernames: server.usernamesFor('user-1', true),
    });
    await enterEmailCode(user, store, 'eleni@example.com');
    expect(await screen.findByRole('header', { name: 'Pick a username' })).toBeOnTheScreen();
    expect(onSignedIn).not.toHaveBeenCalled();
    await user.press(screen.getByRole('button', { name: 'Not now' }));
    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });

  it('an account with a username goes on at once', async () => {
    const user = setupUser();
    const usernames = server.usernamesFor('user-1', true);
    await usernames.setMine({ name: 'eleni', acceptTerms: TERMS_VERSION, ageChecked: true });
    const { onSignedIn } = await openEmail(user, { usernames });
    await enterEmailCode(user, store, 'eleni@example.com');
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('username-form')).toBeNull();
  });

  it('takes a pasted code with spaces or words around it, and the phone’s autofill', async () => {
    const user = setupUser();
    const { onSignedIn } = await openEmail(user);
    await sendEmailCode(user, 'eleni@example.com');
    // A paste and an autofill both arrive as one change.
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('email-code-input'), 'Your code: 100 001.');
    });
    expect(onSignedIn).toHaveBeenCalledWith({ id: 'user-1', isGuest: false });
  });

  it('the code field asks the phone for the code and tells screen readers what it is', async () => {
    const user = setupUser();
    await openEmail(user);
    const address = screen.getByTestId('email-code-address');
    expect(address.props).toEqual(
      expect.objectContaining({
        keyboardType: 'email-address',
        autoComplete: 'email',
        textContentType: 'emailAddress',
        autoCapitalize: 'none',
        accessibilityLabel: 'Email address',
      }),
    );
    const focusBefore = focus.mock.calls.length;
    await sendEmailCode(user, 'eleni@example.com');
    const code = screen.getByTestId('email-code-input');
    expect(code.props).toEqual(
      expect.objectContaining({
        keyboardType: 'number-pad',
        textContentType: 'oneTimeCode',
        // Jest runs as iOS; Android gets `sms-otp`.
        autoComplete: 'one-time-code',
        accessibilityLabel: 'Code from the email',
        accessibilityHint: '6 digits',
      }),
    );
    // No length limit: a paste with spaces must fit.
    expect(code.props.maxLength).toBeUndefined();
    // The code step moves focus to its title.
    expect(focus.mock.calls.slice(focusBefore)).toContainEqual([expect.anything(), 'focus']);
  });

  it('checks the address on the phone first', async () => {
    const user = setupUser();
    await openEmail(user);
    await user.type(screen.getByTestId('email-code-address'), 'eleni@example');
    await user.press(screen.getByTestId('email-code-send'));
    const text = 'This does not look like an email address. Check it and try again.';
    expect(await screen.findByText(text)).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith(text);
    expect(store.sentEmailCodes).toEqual([]);
  });

  it('a wrong code may be typed again; the third wrong one asks for a new code', async () => {
    const user = setupUser();
    const { onSignedIn } = await openEmail(user);
    await sendEmailCode(user, 'eleni@example.com');
    const input = screen.getByTestId('email-code-input');
    await user.type(input, '999999');
    const wrong = 'This code is wrong. Check the email and try again.';
    expect(await screen.findByText(wrong)).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith(wrong);
    // The field is empty for the next try.
    expect(input.props.value).toBe('');
    await user.type(input, '999998');
    expect(await screen.findByText(wrong)).toBeOnTheScreen();
    // The same text again is read again.
    expect(announce.mock.calls.filter(([said]) => said === wrong)).toHaveLength(2);
    await user.type(input, '999997');
    expect(
      await screen.findByText('This code does not work any more. Send a new code.'),
    ).toBeOnTheScreen();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('a new code after the wait; only the newest works', async () => {
    const user = setupUser();
    const { onSignedIn } = await openEmail(user);
    await sendEmailCode(user, 'eleni@example.com');
    const resend = screen.getByRole('button', { name: 'Send a new code' });
    expect(resend).toBeDisabled();
    expect(screen.getByTestId('email-code-wait')).toHaveTextContent(
      /You can ask for a new code in (29|30) seconds\./,
    );
    await act(async () => {
      jest.advanceTimersByTime(RESEND_WAIT_MS);
    });
    expect(screen.queryByTestId('email-code-wait')).toBeNull();
    expect(resend).toBeEnabled();
    const old = newestCode(store, 'eleni@example.com');
    await user.press(resend);
    const note = 'We sent a new code. Only the newest one works.';
    expect(await screen.findByText(note)).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith(note);
    expect(store.sentEmailCodes).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeDisabled();
    await user.type(screen.getByTestId('email-code-input'), old);
    expect(
      await screen.findByText('This code is wrong. Check the email and try again.'),
    ).toBeOnTheScreen();
    await user.type(screen.getByTestId('email-code-input'), newestCode(store, 'eleni@example.com'));
    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });

  it('Change the email goes back with the address filled in', async () => {
    const user = setupUser();
    const { onSignedIn } = await openEmail(user);
    await sendEmailCode(user, 'elenu@example.com');
    await user.press(screen.getByRole('button', { name: 'Change the email' }));
    expect(await screen.findByRole('header', { name: 'Sign in with email' })).toBeOnTheScreen();
    const address = screen.getByTestId('email-code-address');
    expect(address.props.value).toBe('elenu@example.com');
    await user.clear(address);
    await enterEmailCode(user, store, 'eleni@example.com');
    expect(onSignedIn).toHaveBeenCalledWith({ id: 'user-1', isGuest: false });
    expect(store.keys).toEqual({ 'email:eleni@example.com': 'user-1' });
  });

  it('Back shows the choices again, and the guest still works', async () => {
    const user = setupUser();
    const { onSignedIn } = await openEmail(user);
    await user.press(screen.getByRole('button', { name: 'Back' }));
    await user.press(await screen.findByRole('button', { name: 'Continue as a guest' }));
    expect(onSignedIn).toHaveBeenCalledWith({ id: 'guest-1', isGuest: true });
  });

  it('says how long to wait when the server sends too many codes', async () => {
    const user = setupUser();
    const limited: AuthProvider = {
      ...auth,
      requestEmailCode: () =>
        Promise.reject({
          code: 'RATE_LIMITED',
          message: 'too many',
          retryAfterMs: 90_000,
        } satisfies AuthErrorData),
    };
    await openEmail(user, { auth: limited });
    await user.type(screen.getByTestId('email-code-address'), 'eleni@example.com');
    await user.press(screen.getByTestId('email-code-send'));
    expect(
      await screen.findByText('Too many codes for now. Try again in 2 minutes.'),
    ).toBeOnTheScreen();
    // The address step stays.
    expect(screen.getByTestId('email-code-address')).toBeOnTheScreen();
  });

  it('a send that fails says to check the connection, and Send works again', async () => {
    const user = setupUser();
    let fail = true;
    const flaky: AuthProvider = {
      ...auth,
      requestEmailCode: (email, language) =>
        fail
          ? Promise.reject({ code: 'NETWORK', message: 'offline' } satisfies AuthErrorData)
          : auth.requestEmailCode(email, language),
    };
    await openEmail(user, { auth: flaky });
    await user.type(screen.getByTestId('email-code-address'), 'eleni@example.com');
    await user.press(screen.getByTestId('email-code-send'));
    expect(
      await screen.findByText('That did not work. Check the connection and try again.'),
    ).toBeOnTheScreen();
    fail = false;
    await user.press(screen.getByTestId('email-code-send'));
    expect(await screen.findByTestId('email-code-input')).toBeOnTheScreen();
  });

  it('speaks Greek, and the email goes out in Greek', async () => {
    await act(async () => {
      await i18n.changeLanguage('el');
    });
    const user = setupUser();
    await open();
    await user.press(await screen.findByRole('button', { name: 'Συνέχεια με email' }));
    expect(await screen.findByRole('header', { name: 'Σύνδεση με email' })).toBeOnTheScreen();
    await sendEmailCode(user, 'eleni@example.com');
    expect(store.sentEmailCodes[0]?.language).toBe('el');
    expect(screen.getByRole('header', { name: 'Δες το email σου' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Στείλε νέο κωδικό' })).toBeDisabled();
    await user.type(screen.getByTestId('email-code-input'), '999999');
    expect(
      await screen.findByText('Ο κωδικός είναι λάθος. Δες το email και δοκίμασε ξανά.'),
    ).toBeOnTheScreen();
  });
});

describe('emailCode helpers', () => {
  it('codeDigits keeps the first six digits', () => {
    expect(codeDigits('123 456')).toBe('123456');
    expect(codeDigits('Your code: 123456. It works for 5 minutes.')).toBe('123456');
    expect(codeDigits('12a3')).toBe('123');
    expect(codeDigits('')).toBe('');
  });

  it('codeLanguage takes the app language, else English', () => {
    expect(codeLanguage('el')).toBe('el');
    expect(codeLanguage('el-GR')).toBe('el');
    expect(codeLanguage('en')).toBe('en');
    expect(codeLanguage('de')).toBe('en');
  });

  it('resendSecondsLeft counts down to 0 and never below', () => {
    expect(resendSecondsLeft(1000, 1000)).toBe(30);
    expect(resendSecondsLeft(1000, 1001)).toBe(30);
    expect(resendSecondsLeft(1000, 30_000)).toBe(1);
    expect(resendSecondsLeft(1000, 31_000)).toBe(0);
    expect(resendSecondsLeft(1000, 99_000)).toBe(0);
  });
});
