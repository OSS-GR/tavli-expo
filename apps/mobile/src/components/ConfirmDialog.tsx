/**
 * A yes / no dialog (wireframe 13), for the resign dialogs, New game and
 * History. Show it in a `Sheet` with `look="dialog"`.
 */
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from './ActionButton';

export interface ConfirmDialogProps {
  title: string;
  lines: readonly string[];
  /** A boxed line, for example the match score after a resign. */
  note?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  testID?: string;
}

/**
 * The risky action is outlined; the safe one is the main button, nearest
 * the thumb (wireframe 13).
 */
export function ConfirmDialog({
  title,
  lines,
  note,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  testID,
}: ConfirmDialogProps) {
  return (
    <View testID={testID} style={styles.dialog}>
      <Text style={styles.heading} accessibilityRole="header">
        {title}
      </Text>
      {lines.map((line, i) => (
        <Text key={i} style={styles.line}>
          {line}
        </Text>
      ))}
      {note ? (
        <View style={styles.note}>
          <Text style={styles.noteText}>{note}</Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        <ActionButton
          testID="dialog-confirm"
          label={confirmLabel}
          kind="secondary"
          onPress={onConfirm}
        />
        <ActionButton testID="dialog-cancel" label={cancelLabel} onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  dialog: {
    gap: theme.space.sm,
  },
  heading: {
    ...theme.type.title,
    color: theme.colors.text,
  },
  line: {
    ...theme.type.body,
    color: theme.colors.textDim,
    paddingBottom: theme.space.xs,
  },
  note: {
    padding: theme.space.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSelected,
  },
  noteText: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  actions: {
    gap: theme.space.sm,
    paddingTop: theme.space.sm,
  },
}));
