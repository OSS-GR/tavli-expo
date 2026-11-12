/**
 * A short message near the bottom of the screen, for example "Coming soon".
 * It closes by itself. Screen readers hear it at once.
 */
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export const TOAST_MS = 2500;

/** The message to show and a function to show one. A new message restarts the timer. */
export function useToast(ms: number = TOAST_MS) {
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(timer);
  }, [toast, ms]);
  const show = useCallback(
    (text: string) => setToast((old) => ({ text, key: (old?.key ?? 0) + 1 })),
    [],
  );
  return [toast?.text ?? null, show] as const;
}

/**
 * `announced`: the screen reads the text itself (`useAnnouncement`, both
 * platforms), so the toast is no live region and Android reads it once.
 */
export function Toast({
  text,
  testID = 'toast',
  announced = false,
}: {
  text: string | null;
  testID?: string;
  announced?: boolean;
}) {
  if (text === null) return null;
  return (
    <View style={styles.wrap} pointerEvents="none">
      <Text
        testID={testID}
        style={styles.toast}
        accessibilityLiveRegion={announced ? 'none' : 'assertive'}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  wrap: {
    position: 'absolute',
    left: theme.space.lg,
    right: theme.space.lg,
    bottom: rt.insets.bottom + theme.space.xxl,
    alignItems: 'center',
  },
  toast: {
    ...theme.type.bodyStrong,
    overflow: 'hidden',
    textAlign: 'center',
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    borderRadius: theme.radii.lg,
    color: theme.colors.text,
    backgroundColor: theme.colors.backgroundDeep,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
}));
