/**
 * A new chat message, shown for a moment over the game screen while the
 * chat is closed (chat v2, #709). A tap opens the chat; a swipe to a side
 * or up sends it away (#722). Screen readers skip it: they hear the
 * message through `useAnnouncement` already, and the chat button says how
 * many messages are new.
 *
 * It sits in the game screen's top row, beside the chat button, never on
 * the board: a tap meant for a checker must not open the chat.
 */
import { Pressable, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';
import { scheduleOnRN } from 'react-native-worklets';

/** How long a short new message shows. A long one shows longer (`peekMs`). */
export const CHAT_PEEK_MS = 4000;

/** The longest a new message shows. */
export const CHAT_PEEK_MAX_MS = 7000;

/** The most characters the peek shows; the chat has the whole message. */
export const CHAT_PEEK_LENGTH = 80;

/** After this many peeks in `CHAT_PEEK_REPEAT_MS`, a new message shows only the count on the button. */
export const CHAT_PEEK_REPEATS = 2;
export const CHAT_PEEK_REPEAT_MS = 20_000;

/** A swipe this far (points) sends the peek away. */
export const CHAT_PEEK_SWIPE = 40;

/** The start of a long message, cut at `CHAT_PEEK_LENGTH` characters. */
export function peekText(text: string): string {
  const letters = Array.from(text);
  return letters.length <= CHAT_PEEK_LENGTH
    ? text
    : `${letters.slice(0, CHAT_PEEK_LENGTH).join('').trimEnd()}…`;
}

/** How long a message shows: time to read it, from `CHAT_PEEK_MS` up to `CHAT_PEEK_MAX_MS`. */
export function peekMs(text: string): number {
  const shown = Math.min(Array.from(text).length, CHAT_PEEK_LENGTH);
  return Math.min(CHAT_PEEK_MAX_MS, Math.max(CHAT_PEEK_MS, 2500 + 50 * shown));
}

/**
 * The times of the peeks still inside `CHAT_PEEK_REPEAT_MS`, and whether a
 * new message at `now` may show: a player who writes many messages in a
 * row does not keep the peek on screen.
 */
export function nextPeek(
  times: readonly number[],
  now: number,
): { readonly times: readonly number[]; readonly show: boolean } {
  const recent = times.filter((at) => now - at < CHAT_PEEK_REPEAT_MS);
  return recent.length >= CHAT_PEEK_REPEATS
    ? { times: recent, show: false }
    : { times: [...recent, now], show: true };
}

export interface ChatPeekProps {
  /** The other player's name. */
  name: string;
  text: string;
  onPress: () => void;
  /** The player swiped it away. */
  onDismiss: () => void;
}

export function ChatPeek({ name, text, onPress, onDismiss }: ChatPeekProps) {
  // How far the finger went: the end event has no translation.
  const moved = useSharedValue(0);
  const pan = usePanGesture({
    // No spread here: the Worklets Babel plugin does not allow one in a gesture config.
    minDistance: 8,
    testID: 'chat-peek-pan',
    onUpdate: (e) => {
      'worklet';
      // To a side, or up (down is the board).
      moved.set(Math.max(Math.abs(e.translationX), -e.translationY));
    },
    onFinalize: (e) => {
      'worklet';
      if (!e.canceled && moved.get() >= CHAT_PEEK_SWIPE) scheduleOnRN(onDismiss);
      moved.set(0);
    },
  });
  return (
    <GestureDetector gesture={pan}>
      <View collapsable={false}>
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
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create((theme) => ({
  peek: {
    maxWidth: 260,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radii.xl,
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
