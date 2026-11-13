/**
 * Join with a code (#333): Home → "Join with a code" opens here. A friend
 * who lost the invite link (iOS drops it through an App Store or TestFlight
 * install) types the code from the share message.
 *
 * - Look (#521, the Figma pass): 8 code slots in two groups of 4, like the
 *   code on the invite. A typed character turns its slot into a bone tile;
 *   the next slot shows a brass cursor. "Join the game" stays muted until
 *   8 characters are in.
 * - One text field lies over the slots, with clear text: a tap on the
 *   slots focuses it, and a long press pastes. Capital letters, no
 *   autocorrect. A pasted link or the whole share message works too
 *   (`readTypedCode`): the field then holds only its code. Screen readers
 *   hear the field; the slots only show what it holds (`codeSlots`).
 * - The phone checks the text first: a bad code says why under the slots
 *   (`FieldProblem`, read out) and makes no server call. A good code goes
 *   to the route (`onCode`), which opens the invite screen
 *   (`/invite/<CODE>`). That screen does the rest, as for a link: the free
 *   account only from the sign-in choices, then the invite and Accept.
 *   This screen makes no account and calls no server.
 * - Keyboard: it opens with the screen, and the slots and the button stay
 *   above it (`KeyboardAvoidingView` on iOS; Android resizes the window).
 *   The keyboard's Go key checks the text, also before 8 characters.
 * - Focus moves to the title when the screen opens. Large fonts scroll and
 *   the slots grow (the two groups may stack): no text has a line limit.
 *
 * Navigation stays in the route (`app/join.tsx`).
 */
import { INVITE_CODE_LENGTH } from '@tavli/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { FieldProblem } from '@/components/Problem';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useFocusOnShow } from '@/features/accessibility/focus';

import { codeSlots, readTypedCode, type TypedCodeProblem } from './typedCode';

/** The space between two slots of a group, in points (the Figma pass). */
const SLOT_GAP = 5;

export interface JoinCodeScreenProps {
  /** A code that passed the phone's check, in capital letters: open its invite. */
  onCode: (code: string) => void;
  onBack: () => void;
}

export function JoinCodeScreen({ onCode, onBack }: JoinCodeScreenProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<TypedCodeProblem | null>(null);
  const [focused, setFocused] = useState(false);
  const titleRef = useFocusOnShow();
  const length = INVITE_CODE_LENGTH;
  const slots = codeSlots(text);

  const problemText = problem === null ? null : t(`join.problem.${problem}`, { length });

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
          <Text style={styles.intro}>{t('join.intro')}</Text>
          <View style={styles.slotsBox}>
            <View
              testID="join-code-slots"
              style={styles.slots}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden>
              {[0, length / 2].map((start) => (
                <View key={start} style={styles.group}>
                  {Array.from({ length: length / 2 }, (_, i) => start + i).map((index) => (
                    <Slot
                      key={index}
                      char={slots[index]}
                      cursor={focused && index === Math.min(slots.length, length - 1)}
                    />
                  ))}
                </View>
              ))}
            </View>
            <TextInput
              testID="join-code-input"
              style={styles.input}
              value={text}
              onChangeText={(next) => {
                // A pasted link or message keeps only its code.
                const typed = readTypedCode(next);
                setText(
                  typed.kind === 'code' && typed.code.length < next.length ? typed.code : next,
                );
                // A new text gets a new check.
                setProblem(null);
              }}
              onSubmitEditing={submit}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              accessibilityLabel={t('join.label')}
              autoFocus
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              importantForAutofill="no"
              caretHidden
              selectionColor="transparent"
              // Latin letters on iOS, even when the phone uses a Greek keyboard.
              keyboardType={Platform.OS === 'ios' ? 'ascii-capable' : 'default'}
              returnKeyType="go"
              submitBehavior="blurAndSubmit"
            />
          </View>
          <FieldProblem text={problemText} testID="join-problem" />
          <ActionButton
            testID="join-continue"
            label={t('join.continue')}
            disabled={slots.length < length}
            onPress={submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** One slot: a bone tile with its character, an empty well, or the well with the cursor. */
function Slot({ char, cursor }: { char: string | undefined; cursor: boolean }) {
  if (char !== undefined) {
    return (
      <View style={styles.tile}>
        <Text testID="join-code-tile" style={styles.tileText}>
          {char}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.well, cursor && styles.wellActive]}>
      {cursor ? <View style={styles.cursor} /> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  body: {
    flex: 1,
  },
  content: {
    gap: theme.space.lg,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.xxs,
    paddingBottom: Math.max(rt.insets.bottom, theme.space.lg),
  },
  intro: {
    ...theme.type.callout,
    paddingHorizontal: theme.space.xs,
    color: theme.colors.textDim,
  },
  slotsBox: {
    paddingVertical: theme.space.xxs,
  },
  // Two groups of four; with a large font the second group goes under the first.
  slots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.space.md,
  },
  group: {
    flexDirection: 'row',
    gap: SLOT_GAP,
  },
  tile: {
    minWidth: 38,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space.xxs,
    borderRadius: theme.radii.md,
    backgroundColor: theme.dice.face,
    backgroundImage: `linear-gradient(180deg, ${theme.dice.face} 0%, ${theme.avatar.bone.face} 100%)`,
    boxShadow: `0px 2px 0px ${theme.dice.side}`,
  },
  tileText: {
    fontFamily: theme.type.numeral.fontFamily,
    fontSize: 26,
    lineHeight: 32,
    color: theme.colors.onAccent,
  },
  well: {
    minWidth: 38,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.surfaceSunken,
    backgroundColor: theme.colors.surfaceSunken,
    boxShadow: 'inset 0px 2px 4px rgba(0, 0, 0, 0.55)',
  },
  wellActive: {
    borderColor: theme.colors.accent,
  },
  cursor: {
    width: 2,
    height: 26,
    borderRadius: 1,
    backgroundColor: theme.colors.accentLight,
  },
  // The field lies over the slots with clear text, so a tap or a long
  // press (paste) on the slots reaches it.
  input: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    ...theme.type.body,
    color: 'transparent',
    backgroundColor: 'transparent',
  },
}));
