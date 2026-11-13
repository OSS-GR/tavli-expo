/**
 * "Learn to play" on Home (#128): offers the tutorial until the player
 * finishes it or closes it. Settings and the rules page open it again.
 *
 * Since the Figma pass (#517) it is a quiet row, not a banner: the cap,
 * the title and a line, then a small Start button and a close button (×,
 * read as "Not now"). With a large font the buttons wrap under the text.
 */
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Icon } from '@/components/Icon';
import { surfaceStyle } from '@/components/Surface';

export interface LearnCardProps {
  onStart: () => void;
  onDismiss: () => void;
}

export function LearnCard({ onStart, onDismiss }: LearnCardProps) {
  const { t } = useTranslation();
  const { theme } = useUnistyles();
  return (
    <View testID="home-learn" style={styles.row}>
      <View style={styles.head}>
        <Icon name="graduation" size={26} color={theme.colors.accent} />
        <View style={styles.texts}>
          <Text style={styles.title} accessibilityRole="header">
            {t('home.learn.title')}
          </Text>
          <Text style={styles.line}>{t('home.learn.subtitle')}</Text>
        </View>
      </View>
      <View style={styles.buttons}>
        <ActionButton
          testID="home-learn-start"
          kind="secondary"
          size="small"
          label={t('home.learn.startShort')}
          accessibilityLabel={t('home.learn.start')}
          onPress={onStart}
        />
        <Pressable
          testID="home-learn-dismiss"
          accessibilityRole="button"
          accessibilityLabel={t('home.learn.dismiss')}
          hitSlop={4}
          onPress={onDismiss}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Icon name="x" size={18} color={theme.colors.textDim} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    ...surfaceStyle(theme, 'tray'),
    // A step lighter than the trays around it (Figma).
    backgroundColor: theme.colors.surfaceRaised,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.space.md,
    paddingVertical: theme.space.md,
    paddingLeft: theme.space.lg,
    paddingRight: theme.space.sm,
  },
  head: {
    flexGrow: 1,
    flexBasis: 180,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
  },
  texts: {
    flex: 1,
    gap: theme.space.xxs,
  },
  title: {
    ...theme.type.headline,
    color: theme.colors.text,
  },
  line: {
    ...theme.type.footnote,
    color: theme.colors.textDim,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  close: {
    width: theme.touch.minTarget,
    height: theme.touch.minTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
}));
