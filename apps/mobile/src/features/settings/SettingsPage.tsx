/**
 * The frame of each Settings page (#501): `Screen`, a `ScreenHeader` with
 * Back, and a scroll view with the page's cards. The index and every
 * sub-page use it, so they share the side padding and the bottom inset.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';

export interface SettingsPageProps {
  title: string;
  /** Goes back. The header shows a back button only with it. */
  onBack?: () => void;
  /** The screen's test id. */
  testID: string;
  /** The back button's test id. */
  backTestID: string;
  children: ReactNode;
}

export function SettingsPage({ title, onBack, testID, backTestID, children }: SettingsPageProps) {
  const { t } = useTranslation();
  return (
    <Screen testID={testID}>
      <ScreenHeader
        title={title}
        onBack={onBack}
        backLabel={t('common.back')}
        testID={backTestID}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="never">
        {children}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  scroll: {
    flex: 1,
  },
  content: {
    gap: theme.space.lg,
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
    paddingBottom: rt.insets.bottom + theme.space.xxl,
  },
}));
