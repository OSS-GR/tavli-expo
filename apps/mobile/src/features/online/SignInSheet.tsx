/**
 * The sign-in sheet (#401, look from Figma frame 09, #519): "Play online",
 * one line under it and a close button (`SignInHeader`), then the sign-in
 * choices (`SignInChoices`). Play a friend shows it when "Make an invite"
 * finds no saved session. The close button (Not now), a tap on the dimmed
 * part and the Android back button close it and sign in nothing.
 *
 * It is a `Sheet` (a `Modal`), so screen readers stay in it; focus moves
 * to its title. Show it only while it is needed (mount it then), so the
 * focus moves each time it opens.
 *
 * Each time it opens it tells the reminders (#404, `sheetShown`): it is
 * an ask too, so Home shows no card the same day.
 */
import type { Analytics, AppleSheet, AuthProvider, AuthUser } from '@tavli/contracts';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Sheet } from '@/components/Sheet';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { reminders } from '@/features/reminders/reminders';

import { SignInChoices } from './SignInChoices';
import { SignInHeader } from './SignInHeader';

export interface SignInSheetProps {
  auth: AuthProvider;
  onSignedIn: (user: AuthUser) => void;
  onClose: () => void;
  /** For tests. Default: the app's. */
  appleSheet?: AppleSheet;
  /** For tests. Default: the app's analytics. */
  analytics?: Analytics;
}

export function SignInSheet({
  auth,
  onSignedIn,
  onClose,
  appleSheet,
  analytics,
}: SignInSheetProps) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  useEffect(() => {
    reminders.sheetShown();
  }, []);
  return (
    <Sheet
      visible
      onClose={onClose}
      closeLabel={t('signIn.notNow')}
      ownCloseButton
      testID="sign-in-sheet">
      <View style={styles.content}>
        <SignInHeader
          title={t('signIn.title')}
          body={t('signIn.body')}
          titleRef={titleRef}
          onClose={onClose}
        />
        <SignInChoices
          auth={auth}
          onSignedIn={onSignedIn}
          {...(appleSheet === undefined ? {} : { appleSheet })}
          {...(analytics === undefined ? {} : { analytics })}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    // 18 pt between the header and the choices (Figma frame 09).
    gap: theme.space.lg + theme.space.xxs,
  },
}));
