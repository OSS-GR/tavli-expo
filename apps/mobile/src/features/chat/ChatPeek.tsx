/**
 * A new chat message, shown for a moment over the game screen while the
 * chat is closed (chat v2, #709). A tap opens the chat. Screen readers
 * skip it: they hear the message through `useAnnouncement` already, and
 * the chat button says how many messages are new.
 */
import { Pressable, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

/** How long a new message shows. */
export const CHAT_PEEK_MS = 4000;

/** The most characters the peek shows; the chat has the whole message. */
export const CHAT_PEEK_LENGTH = 80;

/** The start of a long message, cut at `CHAT_PEEK_LENGTH` characters. */
export function peekText(text: string): string {
  const letters = Array.from(text);
  return letters.length <= CHAT_PEEK_LENGTH
    ? text
    : `${letters.slice(0, CHAT_PEEK_LENGTH).join('').trimEnd()}…`;
}

export interface ChatPeekProps {
  /** The other player's name. */
  name: string;
  text: string;
  onPress: () => void;
}

export function ChatPeek({ name, text, onPress }: ChatPeekProps) {
  return (
    <Pressable
      testID="chat-peek"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onPress={onPress}
      style={({ pressed }) => [styles.peek, pressed && styles.pressed]}>
      <Text style={styles.name}>{name}</Text>
      <Text testID="chat-peek-text" style={styles.text}>
        {peekText(text)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  peek: {
    maxWidth: 280,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.accentLine,
    backgroundColor: theme.colors.surfaceRaised,
    boxShadow: `0px 6px 16px ${theme.colors.backgroundDeep}`,
  },
  pressed: {
    opacity: 0.7,
  },
  name: {
    ...theme.type.footnote,
    fontWeight: '600',
    color: theme.colors.textDim,
  },
  text: {
    ...theme.type.callout,
    color: theme.colors.text,
  },
}));
