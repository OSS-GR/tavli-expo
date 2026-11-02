/**
 * "Update needed" (#390): a full screen over the whole app when this
 * build is older than the server allows. It has a title, one line and
 * one button, Update, which opens TestFlight or the store. There is no way
 * past it: the Android back button does nothing, and it stays until the
 * server lets this build through again.
 *
 * The root layout (`app/_layout.tsx`) renders it over every route. It is
 * a `Modal`, so screen readers stay in it, and focus moves to its title.
 * During an online game it waits until the player leaves the game screen,
 * unless the server forces the update (`decision.ts`). The app asks the
 * server only where it already talks to it (`updateCheck.ts`), and again
 * each time it comes back to the foreground.
 */
import { usePathname } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Modal, ScrollView, Text, View, type ModalProps } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Screen } from '@/components/Screen';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { appBuild } from '@/services';

import { updateDecision, updateLinks } from './decision';
import { useForegroundUpdateCheck, useUpdateCheck } from './updateCheck';

/** The game board turns with the phone (#185): `/game/<id>`. */
const GAME_PATH = /^\/game\/[^/]+$/;

/** iOS only: the orientations the Modal allows (see `Sheet`). */
const UPRIGHT: ModalProps['supportedOrientations'] = ['portrait'];
const TURNS: ModalProps['supportedOrientations'] = ['portrait', 'landscape'];

/** The Android back button does nothing: there is no way past the screen. */
function stay() {}

export function UpdateGate() {
  // The build never changes while the app runs.
  const [build] = useState(appBuild);
  const policy = useUpdateCheck((s) => s.policy);
  const inOnlineGame = useUpdateCheck((s) => s.onlineGames > 0);
  const pathname = usePathname();
  const [showing, setShowing] = useState(false);
  useForegroundUpdateCheck();

  const show =
    build !== null &&
    updateDecision({ build: build.build, policy, inOnlineGame, showing }) === 'show';
  if (show !== showing) setShowing(show);
  if (!show || build === null) return null;

  return (
    <Modal
      visible
      animationType="fade"
      onRequestClose={stay}
      supportedOrientations={GAME_PATH.test(pathname) ? TURNS : UPRIGHT}>
      <UpdateNeeded links={updateLinks(policy, build)} />
    </Modal>
  );
}

/** Opens the first link the phone can open. */
async function openFirst(links: readonly string[]): Promise<void> {
  for (const url of links) {
    try {
      await Linking.openURL(url);
      return;
    } catch {
      // No app for this link (no TestFlight, no Google Play): try the next.
    }
  }
}

export function UpdateNeeded({ links }: { links: readonly string[] }) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  return (
    <Screen testID="update-needed">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text ref={titleRef} style={styles.title} accessibilityRole="header">
            {t('update.title')}
          </Text>
          <Text style={styles.line}>{t('update.line')}</Text>
          <ActionButton
            testID="update-open"
            label={t('update.button')}
            onPress={() => void openFirst(links)}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.space.xl,
    paddingBottom: rt.insets.bottom + theme.space.xl,
  },
  card: {
    width: '100%',
    maxWidth: 480,
    gap: theme.space.md,
  },
  title: {
    ...theme.type.title,
    color: theme.colors.text,
    textAlign: 'center',
  },
  line: {
    ...theme.type.body,
    color: theme.colors.textDim,
    textAlign: 'center',
    paddingBottom: theme.space.sm,
  },
}));
