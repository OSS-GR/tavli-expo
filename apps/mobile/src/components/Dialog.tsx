/**
 * The frame of a dialog (wireframe 13): a title, lines of text, an
 * optional boxed note, then the buttons a screen passes. `ConfirmDialog`
 * is the yes / no case. Show it in a `Sheet` with `look="dialog"`.
 */
import type { ReactNode, Ref } from 'react';
import { Text, View, type HostInstance } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export interface DialogProps {
  title: string;
  lines: readonly string[];
  /** A boxed line, for example the match score after a resign. */
  note?: string;
  /**
   * A ref for the title, for example from `useFocusOnShow`: a dialog whose
   * text must be read first moves screen reader focus there (#315).
   */
  titleRef?: Ref<HostInstance>;
  /** The buttons, top to bottom. The safe one goes last, nearest the thumb. */
  children?: ReactNode;
  testID?: string;
}

export function Dialog({ title, lines, note, titleRef, children, testID }: DialogProps) {
  return (
    <View testID={testID} style={styles.dialog}>
      <Text ref={titleRef} style={styles.heading} accessibilityRole="header">
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
      {children ? <View style={styles.actions}>{children}</View> : null}
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
