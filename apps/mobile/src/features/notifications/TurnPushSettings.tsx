/**
 * The "Turn notifications" row of Settings (#285). It shows:
 * - on: the player turned them on in the app and the phone allows them.
 *   The app tells the player when it is their turn in an async game;
 * - off (not turned on in the app yet, "Not now", or the phone was not
 *   asked yet): "Turn on". It opens the system prompt only while the
 *   phone was not asked. This is the one place that offers again after
 *   "Not now";
 * - off in the phone settings: "Open phone settings", since the app may
 *   not show the system prompt again.
 *
 * It reads the phone again when the app comes back (the player may have
 * changed it in the phone settings), and then registers the token when
 * the player turned them on (`sync` checks that).
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useStore } from 'zustand';

import { ActionButton } from '@/components/ActionButton';

import type { TurnPushes } from './turnPushes';

/** The app's page in the phone settings. A phone that cannot open it does nothing. */
async function openPhoneSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // Nothing to do: the row still says where to turn them on.
  }
}

export function TurnPushSettings({ pushes }: { pushes: TurnPushes }) {
  const { t } = useTranslation();
  const permission = useStore(pushes.store, (s) => s.permission);
  const turnedOn = useStore(pushes.store, (s) => s.turnedOn);
  const asking = useStore(pushes.store, (s) => s.asking);

  useEffect(() => {
    void pushes.refresh();
    const sub = AppState.addEventListener('change', (state) => {
      // Allowed again in the phone settings: the token goes up (only when
      // the player turned them on in the app).
      if (state === 'active') void pushes.refresh().then(() => pushes.sync());
    });
    return () => sub.remove();
  }, [pushes]);

  const shown =
    permission === null
      ? null
      : permission === 'denied'
        ? 'denied'
        : permission === 'granted' && turnedOn
          ? 'on'
          : 'undetermined';
  const state = shown === null ? null : t(`notifications.settings.${shown}`);

  return (
    <View testID="settings-turn-pushes" style={styles.row}>
      <Text style={styles.label}>{t('notifications.settings.label')}</Text>
      {state === null ? null : (
        <Text testID="settings-turn-pushes-state" style={styles.hint}>
          {state}
        </Text>
      )}
      {shown === 'undetermined' ? (
        <ActionButton
          testID="settings-turn-pushes-on"
          label={t('notifications.settings.turnOn')}
          kind="secondary"
          disabled={asking}
          onPress={() => void pushes.turnOn()}
        />
      ) : null}
      {shown === 'denied' ? (
        <Pressable
          testID="settings-turn-pushes-open"
          accessibilityRole="button"
          onPress={() => void openPhoneSettings()}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
          <Text style={styles.linkText}>{`${t('notifications.settings.openSettings')} ›`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    gap: theme.space.xs,
    paddingTop: theme.space.md,
  },
  label: {
    ...theme.type.body,
    color: theme.colors.text,
  },
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
    paddingBottom: theme.space.xs,
  },
  link: {
    minHeight: theme.touch.row,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  linkText: {
    ...theme.type.body,
    color: theme.colors.text,
    textDecorationLine: 'underline',
  },
}));
