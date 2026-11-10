/**
 * How the app shows a problem (#462). A problem never looks like a note:
 * it has the warning icon, the problem colors and its own box.
 *
 * - `ProblemDialog`: a failed action (a sign-in, a save, a delete) on a
 *   screen. A popup with a title, what to do next and OK.
 * - `ProblemCard`: the same box inside a sheet that is open already. It
 *   takes the sheet's place until OK: iOS does not show a second Modal
 *   over an open one, or right as one closes.
 * - `FieldProblem`: a problem with what the player typed (a wrong code, a
 *   taken username), next to the field, where the eyes are.
 *
 * Each one is read to screen readers (`useAnnouncement`; iOS does not
 * read `accessibilityRole="alert"`): the card reads its title and text
 * when it shows and moves focus to its title (`useFocusOnShow`). Show a
 * new problem with a new React `key`, so it is read again.
 */
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { useFocusOnShow } from '@/features/accessibility/focus';
import { useAnnouncement } from '@/features/game/useAnnouncement';

import { ActionButton } from './ActionButton';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

/** The text of one problem. */
export interface ProblemText {
  /** Short: what went wrong, for example "Apple sign-in is not ready". */
  readonly title: string;
  /** What to do now, for example "Try email, or try again later." */
  readonly text: string;
}

/** What a screen reader hears: the title, then the text. */
export function problemSpeech(problem: ProblemText): string {
  return `${problem.title}. ${problem.text}`;
}

export interface ProblemCardProps {
  problem: ProblemText;
  /** The OK button's label. */
  okLabel: string;
  onOk: () => void;
  testID?: string;
}

export function ProblemCard({ problem, okLabel, onOk, testID = 'problem' }: ProblemCardProps) {
  const { theme } = useUnistyles();
  const titleRef = useFocusOnShow();
  useAnnouncement(problemSpeech(problem));
  return (
    <View testID={testID} style={styles.card}>
      <View style={styles.head}>
        <Icon name="circleAlert" color={theme.colors.problem} size={28} />
        <Text ref={titleRef} style={styles.title} accessibilityRole="header">
          {problem.title}
        </Text>
      </View>
      <Text style={styles.text}>{problem.text}</Text>
      <ActionButton testID={`${testID}-ok`} label={okLabel} onPress={onOk} />
    </View>
  );
}

export interface ProblemDialogProps {
  /** The problem to show, or `null` for none. */
  problem: ProblemText | null;
  okLabel: string;
  onOk: () => void;
  testID?: string;
}

/** A popup for a failed action on a screen with no sheet open. */
export function ProblemDialog({ problem, okLabel, onOk, testID = 'problem' }: ProblemDialogProps) {
  return (
    <Sheet visible={problem !== null} onClose={onOk} closeLabel={okLabel} look="dialog">
      {problem !== null ? (
        <ProblemCard problem={problem} okLabel={okLabel} onOk={onOk} testID={testID} />
      ) : null}
    </Sheet>
  );
}

export interface FieldProblemProps {
  /** The problem with the field, or `null` for none. */
  text: string | null;
  /**
   * The event's key for `useAnnouncement`: a new key reads the same text
   * again (a second wrong code). Default: each new text is read once.
   */
  eventKey?: string;
  testID?: string;
}

/** A problem with what the player typed, under the field. */
export function FieldProblem({ text, eventKey, testID }: FieldProblemProps) {
  const { theme } = useUnistyles();
  useAnnouncement(text, text === null ? undefined : eventKey);
  if (text === null) return null;
  return (
    <View style={styles.field}>
      <Icon name="circleAlert" color={theme.colors.problem} size={20} />
      <Text testID={testID} style={styles.fieldText}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.space.md,
    padding: theme.space.lg,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.problemLine,
    backgroundColor: theme.colors.problemWash,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  title: {
    ...theme.type.title,
    color: theme.colors.text,
    flexShrink: 1,
  },
  text: {
    ...theme.type.body,
    color: theme.colors.text,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.sm,
    padding: theme.space.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.problemLine,
    backgroundColor: theme.colors.problemWash,
  },
  fieldText: {
    ...theme.type.body,
    color: theme.colors.problem,
    flexShrink: 1,
  },
}));
