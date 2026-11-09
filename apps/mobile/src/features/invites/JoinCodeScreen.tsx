/**
 * Join with a code (#333): Home → "Join with a code" opens here. A friend
 * who lost the invite link (iOS drops it through an App Store or TestFlight
 * install) types the code from the share message.
 *
 * - One text field: capital letters, no autocorrect. A pasted link or the
 *   whole share message works too (`readTypedCode`).
 * - The phone checks the text first: a bad code says why and makes no
 *   server call. A good code goes to the route (`onCode`), which opens the
 *   invite screen (`/invite/<CODE>`). That screen does the rest, as for a
 *   link: the free account only from the sign-in choices, then the invite
 *   and Accept. This screen makes no account and calls no server.
 * - Keyboard: the field and Continue stay above the keyboard
 *   (`KeyboardAvoidingView` on iOS; Android resizes the window). The
 *   keyboard's Go key is Continue.
 * - A problem line is read to screen readers (`useAnnouncement`; iOS
 *   VoiceOver does not read `accessibilityRole="alert"`). Focus moves to
 *   the title when the screen opens. Large fonts scroll: no text has a line
 *   limit.
 * - Look: the Home style, like Play a friend (`FriendSetupScreen`).
 *
 * Navigation stays in the route (`app/join.tsx`).
 */
import { INVITE_CODE_LENGTH } from '@tavli/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionCard } from '@/components/SectionCard';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';

import { readTypedCode, type TypedCodeProblem } from './typedCode';

export interface JoinCodeScreenProps {
  /** A code that passed the phone's check, in capital letters: open its invite. */
  onCode: (code: string) => void;
  onBack: () => void;
}

export function JoinCodeScreen({ onCode, onBack }: JoinCodeScreenProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<TypedCodeProblem | null>(null);
  const titleRef = useFocusOnShow();
  const length = INVITE_CODE_LENGTH;

  const problemText = problem === null ? null : t(`join.problem.${problem}`, { length });
  useAnnouncement(problemText);

  const submit = () => {
    const typed = readTypedCode(text);
    if (typed.kind === 'empty') return;
    if (typed.kind === 'problem') {
      setProblem(typed.problem);
      return;
    }
    setProblem(null);
    onCode(typed.code);
  };

  return (
    <Screen testID="join-code">
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader
          title={t('join.title')}
          titleRef={titleRef}
          onBack={onBack}
          backLabel={t('common.back')}
          testID="join-back"
        />
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.heroBadge}>
              <Icon name="keyboard" size={26} color={theme.colors.accent} />
            </View>
            <Text style={styles.intro}>{t('join.intro', { length })}</Text>
          </View>
          <SectionCard title={t('join.label')} padded>
            <TextInput
              testID="join-code-input"
              style={[styles.input, problem !== null && styles.inputProblem]}
              value={text}
              onChangeText={(next) => {
                setText(next);
                // A new text gets a new check.
                setProblem(null);
              }}
              onSubmitEditing={submit}
              placeholder={t('join.placeholder')}
              placeholderTextColor={theme.colors.textDim}
              accessibilityLabel={t('join.label')}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              importantForAutofill="no"
              // Latin letters on iOS, even when the phone uses a Greek keyboard.
              keyboardType={Platform.OS === 'ios' ? 'ascii-capable' : 'default'}
              returnKeyType="go"
              submitBehavior="blurAndSubmit"
            />
            <Text style={styles.hint}>{t('join.hint')}</Text>
          </SectionCard>
        </ScrollView>
        <View style={styles.footer}>
          {problemText !== null ? (
            <Text testID="join-problem" style={styles.problem}>
              {problemText}
            </Text>
          ) : null}
          <ActionButton
            testID="join-continue"
            label={t('join.continue')}
            disabled={text.trim() === ''}
            onPress={submit}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  body: {
    flex: 1,
  },
  content: {
    gap: theme.space.lg,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.lg,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    padding: theme.space.lg,
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface,
    backgroundImage: `linear-gradient(160deg, ${theme.colors.surfaceSelected} 0%, ${theme.colors.surface} 70%)`,
    boxShadow: '0px 8px 20px rgba(0, 0, 0, 0.3)',
  },
  heroBadge: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundDeep,
  },
  intro: {
    ...theme.type.body,
    flex: 1,
    color: theme.colors.text,
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
    letterSpacing: 2,
  },
  inputProblem: {
    borderColor: theme.colors.accent,
  },
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  problem: {
    ...theme.type.body,
    color: theme.colors.text,
  },
  footer: {
    gap: theme.space.sm,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.lg),
  },
}));
