/**
 * The sign-in sheet (#401): "Play online", a line on why, and the sign-in
 * choices (`SignInChoices`). Play a friend shows it when "Make an invite"
 * finds no saved session. Not now, a tap on the dimmed part and the
 * Android back button close it and sign in nothing.
 *
 * It is a `Sheet` (a `Modal`), so screen readers stay in it; focus moves
 * to its title. Show it only while it is needed (mount it then), so the
 * focus moves each time it opens.
 */
import type { Analytics, AppleSheet, AuthProvider, AuthUser } from '@tavli/contracts';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Sheet } from '@/components/Sheet';
import { useFocusOnShow } from '@/features/accessibility/focus';

import { SignInChoices } from './SignInChoices';

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
  return (
    <Sheet visible onClose={onClose} closeLabel={t('signIn.notNow')} testID="sign-in-sheet">
      <Text ref={titleRef} style={styles.title} accessibilityRole="header">
        {t('signIn.title')}
      </Text>
      <Text style={styles.body}>{t('signIn.body')}</Text>
      <SignInChoices
        auth={auth}
        onSignedIn={onSignedIn}
        onNotNow={onClose}
        {...(appleSheet === undefined ? {} : { appleSheet })}
        {...(analytics === undefined ? {} : { analytics })}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  title: {
    ...theme.type.title,
    color: theme.colors.text,
  },
  body: {
    ...theme.type.body,
    color: theme.colors.textDim,
    marginBottom: theme.space.sm,
  },
}));
