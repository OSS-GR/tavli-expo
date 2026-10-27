/**
 * A card over the board: no legal moves (wireframe 6f), game end (8) and
 * match end (9). The board stays visible around it.
 */
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export interface GameCardProps {
  title: string;
  /** Lines under the title. */
  lines?: readonly string[];
  /** A small chip under the title, e.g. "Mono · +1 point". */
  chip?: string;
  /** Small text at the bottom, e.g. "Closes by itself after 3 s." */
  footnote?: string;
  /** Buttons. */
  children?: ReactNode;
  testID?: string;
}

export function GameCard({ title, lines = [], chip, footnote, children, testID }: GameCardProps) {
  return (
    <View testID={testID} style={styles.card} accessibilityLiveRegion="polite">
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {chip ? (
        <View style={styles.chip}>
          <Text style={styles.chipText}>{chip}</Text>
        </View>
      ) : null}
      {lines.map((line, i) => (
        <Text key={i} style={styles.line}>
          {line}
        </Text>
      ))}
      {children ? <View style={styles.actions}>{children}</View> : null}
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    marginHorizontal: theme.space.lg,
    padding: theme.space.lg,
    gap: theme.space.sm,
    borderRadius: theme.radii.xl,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  title: {
    ...theme.type.title,
    color: theme.colors.text,
  },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radii.pill,
    borderWidth: 2,
    borderColor: theme.colors.accent,
  },
  chipText: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  line: {
    ...theme.type.body,
    color: theme.colors.textDim,
  },
  actions: {
    gap: theme.space.sm,
    paddingTop: theme.space.sm,
  },
  footnote: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    textAlign: 'center',
    fontStyle: 'italic',
  },
}));
