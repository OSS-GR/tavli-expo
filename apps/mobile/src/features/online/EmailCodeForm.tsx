/**
 * The email code step (#433, ADR-0008 point 3): an address, then the
 * 6-digit code from the email. The sign-in choices (`SignInChoices`) and
 * Settings → Account show it; the caller's `onCode` signs in or saves the
 * key with the code.
 *
 * - The phone checks the address first (`normalizeEmail`), then asks the
 *   server for a code (`requestEmailCode`, in the app's language). The
 *   server answers the same for a known and a new address.
 * - One code field: it takes a paste ("123 456" or the whole mail line),
 *   the phone's code autofill (`oneTimeCode`, `one-time-code`,
 *   `sms-otp`), and a screen reader reads its label and hint. Six digits
 *   check the code at once; Continue does too.
 * - A new code after `RESEND_WAIT_MS`; only the newest code works.
 *   "Change the email" goes back to the address, which stays filled in.
 * - A wrong code may be typed again (the server allows 3 tries); after
 *   that, or after 5 minutes, the form asks for a new code.
 * - The state lives in this component, so it stays while the player
 *   switches to the mail app and back. The proof of the send (the
 *   ticket) stays in the adapter's memory.
 * - Each step moves focus to its title. Problems and notes are read to
 *   screen readers (`useAnnouncement`). No text has a line limit.
 *
 * Never log or send the address or the code.
 */
import {
  EMAIL_CODE_LENGTH,
  normalizeEmail,
  type AuthProvider,
  type EmailKeyCredential,
} from '@tavli/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';

import {
  codeDigits,
  codeLanguage,
  codeProblemOf,
  resendSecondsLeft,
  sendProblemOf,
  type EmailCodeProblemState,
} from './emailCode';

export interface EmailCodeFormProps {
  auth: AuthProvider;
  /** The title of the address step ("Sign in with email"). Focus moves to it. */
  title: string;
  /**
   * Uses the code: a sign-in or a saved key. Rejects with `AuthErrorData`
   * (`WRONG_CODE`, `REJECTED`, …): the form says what it means. After it
   * resolves the form waits for the caller to close it.
   */
  onCode: (credential: EmailKeyCredential) => Promise<void>;
  /** Back to where the player came from. */
  onBack: () => void;
  backLabel: string;
}

type Busy = 'send' | 'check' | null;
type Note = 'resent' | null;

// Each problem or note is a new event for screen readers, also the same text again.
let said = 0;

export function EmailCodeForm({ auth, title, onCode, onBack, backLabel }: EmailCodeFormProps) {
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<'address' | 'code'>('address');
  const [address, setAddress] = useState('');
  // The address the last code went to.
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [problem, setProblem] = useState<EmailCodeProblemState | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [event, setEvent] = useState(0);
  // One call at a time: a second tap before the render sees `busy` does nothing.
  const calling = useRef(false);
  // False once the form is gone (a call answers later).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const waitLeft = step === 'code' ? resendSecondsLeft(sentAt, now) : 0;
  const waiting = waitLeft > 0;
  // A tick each second while the resend waits.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  const problemText =
    problem === null
      ? null
      : problem.problem === 'rateLimited' && problem.minutes !== undefined
        ? t('emailCode.problem.rateLimitedMinutes', { count: problem.minutes })
        : t(`emailCode.problem.${problem.problem}`);
  const noteText = note === null ? null : t(`emailCode.${note}`);
  useAnnouncement(problemText, problemText === null ? undefined : `email-code:${event}`);
  useAnnouncement(noteText, noteText === null ? undefined : `email-code:${event}`);

  const show = (next: EmailCodeProblemState | null, nextNote: Note = null) => {
    setProblem(next);
    setNote(nextNote);
    said += 1;
    setEvent(said);
  };

  const send = (again: boolean) => {
    const email = normalizeEmail(again && sentTo !== null ? sentTo : address);
    if (email === null) {
      show({ problem: 'badAddress' });
      return;
    }
    if (calling.current) return;
    calling.current = true;
    setBusy('send');
    setProblem(null);
    setNote(null);
    auth.requestEmailCode(email, codeLanguage(i18n.language)).then(
      () => {
        calling.current = false;
        if (!mounted.current) return;
        setBusy(null);
        setSentTo(email);
        setCode('');
        const at = Date.now();
        setSentAt(at);
        setNow(at);
        setStep('code');
        if (again) show(null, 'resent');
      },
      (error: unknown) => {
        calling.current = false;
        if (!mounted.current) return;
        setBusy(null);
        show(sendProblemOf(error));
      },
    );
  };

  const check = (digits: string) => {
    if (sentTo === null || digits.length !== EMAIL_CODE_LENGTH || calling.current) return;
    calling.current = true;
    setBusy('check');
    setProblem(null);
    setNote(null);
    onCode({ provider: 'email', email: sentTo, code: digits }).then(
      () => {
        calling.current = false;
        // The caller closes the form now; it stays busy until then.
      },
      (error: unknown) => {
        calling.current = false;
        if (!mounted.current) return;
        setBusy(null);
        setCode('');
        show(codeProblemOf(error));
      },
    );
  };

  const changeAddress = () => {
    setStep('address');
    setCode('');
    setProblem(null);
    setNote(null);
  };

  return (
    <View testID="email-code-form" style={styles.form}>
      {step === 'address' ? (
        <AddressStep
          title={title}
          address={address}
          busy={busy}
          onAddress={(next) => {
            setAddress(next);
            setProblem(null);
          }}
          onSend={() => send(false)}
        />
      ) : (
        <CodeStep
          sentTo={sentTo ?? ''}
          code={code}
          busy={busy}
          waitLeft={waitLeft}
          onCode={(text) => {
            const digits = codeDigits(text);
            setCode(digits);
            if (digits !== code) setProblem(null);
            // Six digits (typed, pasted or filled in by the phone) check at once.
            if (digits.length === EMAIL_CODE_LENGTH && digits !== code) check(digits);
          }}
          onCheck={() => check(code)}
          onResend={() => send(true)}
          onChange={changeAddress}
        />
      )}
      {busy !== null ? (
        <Text style={styles.line}>
          {t(busy === 'send' ? 'emailCode.sending' : 'emailCode.checking')}
        </Text>
      ) : null}
      {noteText !== null ? (
        <Text testID="email-code-note" style={styles.line}>
          {noteText}
        </Text>
      ) : null}
      {problemText !== null ? (
        <Text testID="email-code-problem" style={styles.line}>
          {problemText}
        </Text>
      ) : null}
      <ActionButton
        testID="email-code-back"
        kind="text"
        label={backLabel}
        disabled={busy === 'check'}
        onPress={onBack}
      />
    </View>
  );
}

function AddressStep({
  title,
  address,
  busy,
  onAddress,
  onSend,
}: {
  title: string;
  address: string;
  busy: Busy;
  onAddress: (text: string) => void;
  onSend: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const titleRef = useFocusOnShow();
  return (
    <>
      <Text ref={titleRef} style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.body}>{t('emailCode.body')}</Text>
      <TextInput
        testID="email-code-address"
        style={styles.input}
        value={address}
        editable={busy === null}
        onChangeText={onAddress}
        onSubmitEditing={onSend}
        placeholder={t('emailCode.address')}
        placeholderTextColor={theme.colors.textDim}
        accessibilityLabel={t('emailCode.address')}
        keyboardType="email-address"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="email"
        textContentType="emailAddress"
        maxLength={254}
        returnKeyType="send"
        submitBehavior="blurAndSubmit"
      />
      <ActionButton
        testID="email-code-send"
        label={t('emailCode.send')}
        disabled={busy !== null || address.trim() === ''}
        onPress={onSend}
      />
    </>
  );
}

function CodeStep({
  sentTo,
  code,
  busy,
  waitLeft,
  onCode,
  onCheck,
  onResend,
  onChange,
}: {
  sentTo: string;
  code: string;
  busy: Busy;
  waitLeft: number;
  onCode: (text: string) => void;
  onCheck: () => void;
  onResend: () => void;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const titleRef = useFocusOnShow();
  return (
    <>
      <Text ref={titleRef} style={styles.title} accessibilityRole="header">
        {t('emailCode.codeTitle')}
      </Text>
      <Text style={styles.body}>{t('emailCode.sent', { email: sentTo })}</Text>
      <TextInput
        testID="email-code-input"
        style={[styles.input, styles.code]}
        value={code}
        editable={busy === null}
        onChangeText={onCode}
        onSubmitEditing={onCheck}
        placeholder="123456"
        placeholderTextColor={theme.colors.textDim}
        accessibilityLabel={t('emailCode.code')}
        accessibilityHint={t('emailCode.codeHint')}
        keyboardType="number-pad"
        inputMode="numeric"
        // No maxLength: a paste with spaces or words around the code still works.
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        autoCorrect={false}
        spellCheck={false}
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
      />
      <ActionButton
        testID="email-code-confirm"
        label={t('emailCode.confirm')}
        disabled={busy !== null || code.length !== EMAIL_CODE_LENGTH}
        onPress={onCheck}
      />
      <ActionButton
        testID="email-code-resend"
        kind="secondary"
        label={t('emailCode.resend')}
        disabled={busy !== null || waitLeft > 0}
        onPress={onResend}
      />
      {waitLeft > 0 ? (
        <Text testID="email-code-wait" style={styles.hint}>
          {t('emailCode.resendWait', { count: waitLeft })}
        </Text>
      ) : null}
      <ActionButton
        testID="email-code-change"
        kind="text"
        label={t('emailCode.change')}
        disabled={busy !== null}
        onPress={onChange}
      />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  form: {
    gap: theme.space.sm,
  },
  title: {
    ...theme.type.title,
    color: theme.colors.text,
  },
  body: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  input: {
    ...theme.type.title,
    minHeight: theme.touch.button,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundDeep,
    color: theme.colors.text,
  },
  code: {
    letterSpacing: 4,
  },
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  line: {
    ...theme.type.body,
    color: theme.colors.text,
  },
}));
