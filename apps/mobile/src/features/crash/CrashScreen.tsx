/**
 * The "Something went wrong" screen. It shows no error details: players
 * cannot act on them, and they may hold data we do not want on screen.
 * The details go to the crash reporter instead.
 */
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';

export interface CrashScreenProps {
  onRestart: () => void;
}

export function CrashScreen({ onRestart }: CrashScreenProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.screen} testID="crash-screen">
      <View style={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          {t('crash.title')}
        </Text>
        <Text style={styles.body}>{t('crash.body')}</Text>
      </View>
      <ActionButton label={t('crash.restart')} onPress={onRestart} testID="crash-restart" />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: rt.insets.top + theme.space.xl,
    paddingBottom: rt.insets.bottom + theme.space.xl,
    paddingHorizontal: theme.space.xl,
    justifyContent: 'center',
    gap: theme.space.xl,
  },
  content: {
    alignItems: 'center',
    gap: theme.space.sm,
  },
  title: {
    ...theme.type.title,
    color: theme.colors.text,
    textAlign: 'center',
  },
  body: {
    ...theme.type.body,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
}));
