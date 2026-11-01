/**
 * "Learn to play" on Home (#128): offers the tutorial until the player
 * finishes it or taps "Not now". Settings and the rules page open it again.
 */
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/Icon';

export interface LearnCardProps {
  onStart: () => void;
  onDismiss: () => void;
}

export function LearnCard({ onStart, onDismiss }: LearnCardProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  return (
    <View testID="home-learn" style={styles.card}>
      <View style={styles.head}>
        <View style={styles.badge}>
          <Icon name="graduation" size={22} color={theme.colors.turnText} />
        </View>
        <View style={styles.texts}>
          <Text style={styles.title} accessibilityRole="header">
            {t('home.learn.title')}
          </Text>
          <Text style={styles.line}>{t('home.learn.subtitle')}</Text>
        </View>
      </View>
      <View style={styles.buttons}>
        <Pressable
          testID="home-learn-start"
          accessibilityRole="button"
          accessibilityLabel={t('home.learn.start')}
          onPress={onStart}
          style={({ pressed }) => [styles.start, pressed && styles.pressed]}>
          <Text style={styles.startText}>{t('home.learn.start')}</Text>
        </Pressable>
        <Pressable
          testID="home-learn-dismiss"
          accessibilityRole="button"
          accessibilityLabel={t('home.learn.dismiss')}
          onPress={onDismiss}
          hitSlop={4}
          style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}>
          <Text style={styles.dismissText}>{t('home.learn.dismiss')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // A brass-tinted banner (#342): it stands out from the walnut tiles.
  card: {
    gap: theme.space.sm,
    padding: theme.space.lg,
    borderRadius: theme.radii.xl,
    borderWidth: 1,
    borderColor: `${theme.colors.accent}88`,
    backgroundColor: theme.colors.surface,
    backgroundImage: `linear-gradient(135deg, ${theme.colors.accent}38 0%, ${theme.colors.surface} 80%)`,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.md,
  },
  badge: {
    width: theme.touch.minTarget,
    height: theme.touch.minTarget,
    borderRadius: theme.radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundDeep,
  },
  texts: {
    flex: 1,
    gap: theme.space.xxs,
  },
  title: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
  },
  line: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
  // Greek labels are longer: the buttons wrap instead of shrinking.
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space.md,
    paddingTop: theme.space.xs,
  },
  start: {
    minHeight: theme.touch.minTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.space.xl,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.accent,
  },
  startText: {
    ...theme.type.bodyStrong,
    color: theme.colors.onAccent,
  },
  dismiss: {
    minHeight: theme.touch.minTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.space.sm,
  },
  dismissText: {
    ...theme.type.bodyStrong,
    color: theme.colors.text,
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.7,
  },
}));
