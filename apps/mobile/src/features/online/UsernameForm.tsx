/**
 * The username step (#405): a name box, then the terms of use and the age
 * box when the server says they are still needed, then Save.
 *
 * - The sign-in choices show it after a sign-in with a key (Apple) when
 *   the account has no username yet (`SignInChoices`), with Not now.
 *   Settings → Username shows it to pick or change the name
 *   (`UsernameScreen`).
 * - The phone checks the name first (`checkUsername`, `isAllowedUsername`
 *   from `@tavli/online`, the server's own rules) and says what is wrong;
 *   the server checks again and also says when another player has it.
 * - The age box asks once: 16 or 13 by the phone's region
 *   (`minimumAge`). The server keeps only that it was ticked, and when.
 * - Within 30 days of a change the box is read-only and says when the
 *   next change is possible.
 * - Problems are read to screen readers (`useAnnouncement`). No text has
 *   a line limit, so large fonts wrap.
 */
import { TERMS_VERSION, isUsernameErrorData } from '@tavli/contracts';
import type { MyUsername, UsernameErrorCode, Usernames } from '@tavli/contracts';
import { checkUsername, isAllowedUsername } from '@tavli/online';
import { useLocales } from 'expo-localization';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { ToggleRow } from '@/components/settings/ToggleRow';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';

import { minimumAge, termsUrl } from './usernameStep';

export interface UsernameFormProps {
  usernames: Usernames;
  /** The state the server gave (`Usernames.mine`). */
  mine: MyUsername;
  /** After a save: the new state. */
  onDone: (mine: MyUsername) => void;
  /** Shows a Not now button: the player keeps the guest name for now. */
  onNotNow?: () => void;
  /** A title above the form (the sign-in card). Focus moves to it. */
  title?: string;
  /** For tests. Default: the phone's region. */
  region?: string | null;
}

type Problem = UsernameErrorCode | 'failed';

export function UsernameForm({
  usernames,
  mine,
  onDone,
  onNotNow,
  title,
  region,
}: UsernameFormProps) {
  const { t, i18n } = useTranslation();
  const { theme } = useUnistyles();
  const locales = useLocales();
  const titleRef = useFocusOnShow();
  const [text, setText] = useState(mine.name ?? '');
  const [termsTicked, setTermsTicked] = useState(false);
  const [ageTicked, setAgeTicked] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  // False once the form is gone (the save answers later).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const age = minimumAge(region === undefined ? (locales[0]?.regionCode ?? null) : region);
  const askTerms = mine.termsVersion !== TERMS_VERSION;
  const askAge = !mine.ageChecked;
  const locked = mine.name !== null && mine.nextChangeAt !== null;
  const name = text.trim();
  const check = checkUsername(name);
  // "Too short" waits for a Save: every name is short while it is typed.
  const ruleProblem =
    name !== '' && !check.ok && (check.problem !== 'short' || tried) ? check.problem : null;
  const same = check.ok && check.name === mine.name;
  const canSave =
    !locked && !busy && name !== '' && (!askTerms || termsTicked) && (!askAge || ageTicked);

  const problemText =
    ruleProblem !== null
      ? t(`username.problem.${ruleProblem}`)
      : problem !== null
        ? t(`username.error.${problem}`)
        : null;
  useAnnouncement(problemText);

  const save = () => {
    setTried(true);
    if (!check.ok) return;
    if (!isAllowedUsername(check.name)) {
      setProblem('NOT_ALLOWED');
      return;
    }
    if (same && !askTerms && !askAge) {
      onDone(mine);
      return;
    }
    setBusy(true);
    setProblem(null);
    usernames
      .setMine({
        name: check.name,
        ...(askTerms ? { acceptTerms: TERMS_VERSION } : {}),
        ...(askAge ? { ageChecked: true } : {}),
      })
      .then(
        (next) => {
          if (!mounted.current) return;
          setBusy(false);
          onDone(next);
        },
        (error: unknown) => {
          if (!mounted.current) return;
          setBusy(false);
          setProblem(isUsernameErrorData(error) ? error.code : 'failed');
        },
      );
  };

  const nextChange =
    mine.nextChangeAt === null
      ? null
      : new Date(mine.nextChangeAt).toLocaleDateString(i18n.language, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });

  return (
    <View testID="username-form" style={styles.form}>
      {title !== undefined ? (
        <Text ref={titleRef} style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <Text style={styles.body}>{t('username.body')}</Text>
      <TextInput
        testID="username-input"
        style={[styles.input, problemText !== null && styles.inputProblem]}
        value={text}
        editable={!locked && !busy}
        onChangeText={(next) => {
          setText(next);
          setProblem(null);
        }}
        onSubmitEditing={() => {
          if (canSave) save();
        }}
        placeholder={t('username.label')}
        placeholderTextColor={theme.colors.textDim}
        accessibilityLabel={t('username.label')}
        accessibilityHint={t('username.rules')}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        importantForAutofill="no"
        textContentType={Platform.OS === 'ios' ? 'username' : undefined}
        maxLength={32}
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
      />
      <Text style={styles.hint}>
        {locked && nextChange !== null
          ? t('username.nextChange', { date: nextChange })
          : t('username.rules')}
      </Text>
      {mine.name !== null && !locked ? (
        <Text style={styles.hint}>{t('username.changeRule')}</Text>
      ) : null}
      {askTerms ? (
        <>
          <ToggleRow
            testID="username-terms"
            label={t('username.terms')}
            value={termsTicked}
            onValueChange={setTermsTicked}
          />
          <ActionButton
            testID="username-read-terms"
            kind="text"
            label={t('username.readTerms')}
            onPress={() => void Linking.openURL(termsUrl(i18n.language)).catch(() => undefined)}
          />
        </>
      ) : null}
      {askAge ? (
        <ToggleRow
          testID="username-age"
          label={t('username.age', { age })}
          hint={t('username.ageHint')}
          value={ageTicked}
          onValueChange={setAgeTicked}
        />
      ) : null}
      {problemText !== null ? (
        <Text testID="username-problem" style={styles.line}>
          {problemText}
        </Text>
      ) : null}
      {busy ? <Text style={styles.line}>{t('username.saving')}</Text> : null}
      {!locked ? (
        <ActionButton
          testID="username-save"
          label={t('username.save')}
          disabled={!canSave}
          onPress={save}
        />
      ) : null}
      {onNotNow !== undefined ? (
        <ActionButton
          testID="username-not-now"
          kind="text"
          label={t('username.notNow')}
          disabled={busy}
          onPress={onNotNow}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  form: {
    gap: theme.space.sm,
  },
  title: {
    ...theme.type.title2,
    color: theme.colors.text,
  },
  body: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  input: {
    ...theme.type.title2,
    minHeight: theme.touch.button,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundDeep,
    color: theme.colors.text,
  },
  inputProblem: {
    borderColor: theme.colors.accent,
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
