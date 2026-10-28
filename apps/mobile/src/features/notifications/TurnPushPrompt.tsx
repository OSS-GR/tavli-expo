/**
 * The offer of turn notifications (#285): "We tell you when it is your
 * turn", with "Turn on" and "Not now". It shows after the player makes or
 * accepts an async invite (`TurnPushes.offer`), never at first launch.
 * "Turn on" opens the system prompt. "Not now", the dimmed part and the
 * Android back button all count as "Not now": the app does not offer
 * again by itself (Settings still can).
 *
 * The root layout (`app/_layout.tsx`) shows it over any screen. It is a
 * `Sheet` (a `Modal`), so screen readers stay in it, and focus moves to
 * its title. Over the game screen it turns with the phone.
 */
import { usePathname } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useStore } from 'zustand';

import { ActionButton } from '@/components/ActionButton';
import { Sheet } from '@/components/Sheet';
import { useFocusOnShow } from '@/features/accessibility/focus';

import type { TurnPushes } from './turnPushes';

/** The game board turns with the phone (#185): `/game/<id>`. */
const GAME_PATH = /^\/game\/[^/]+$/;

export function TurnPushPrompt({ pushes }: { pushes: TurnPushes }) {
  const { t } = useTranslation();
  const offering = useStore(pushes.store, (s) => s.offering);
  const asking = useStore(pushes.store, (s) => s.asking);
  const pathname = usePathname();
  const notNow = () => {
    if (!asking) pushes.notNow();
  };
  return (
    <Sheet
      visible={offering}
      onClose={notNow}
      closeLabel={t('notifications.offer.notNow')}
      look="dialog"
      turns={GAME_PATH.test(pathname)}
      testID="turn-push-offer">
      {/* Mounted only while it shows, so focus moves to the title each time. */}
      {offering ? (
        <Offer asking={asking} onTurnOn={() => void pushes.turnOn()} onNotNow={notNow} />
      ) : null}
    </Sheet>
  );
}

function Offer({
  asking,
  onTurnOn,
  onNotNow,
}: {
  asking: boolean;
  onTurnOn: () => void;
  onNotNow: () => void;
}) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  return (
    <View style={styles.offer}>
      <Text ref={titleRef} style={styles.title} accessibilityRole="header">
        {t('notifications.offer.title')}
      </Text>
      <Text style={styles.line}>{t('notifications.offer.why')}</Text>
      <View style={styles.actions}>
        <ActionButton
          testID="turn-push-on"
          label={t('notifications.offer.turnOn')}
          disabled={asking}
          onPress={onTurnOn}
        />
        <ActionButton
          testID="turn-push-not-now"
          label={t('notifications.offer.notNow')}
          kind="text"
          disabled={asking}
          onPress={onNotNow}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  offer: {
    gap: theme.space.sm,
  },
  title: {
    ...theme.type.title,
    color: theme.colors.text,
  },
  line: {
    ...theme.type.body,
    color: theme.colors.textDim,
    paddingBottom: theme.space.xs,
  },
  actions: {
    gap: theme.space.sm,
    paddingTop: theme.space.sm,
  },
}));
