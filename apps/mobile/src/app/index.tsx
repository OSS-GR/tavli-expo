import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export default function HomeScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Link href="/settings" asChild>
          <Pressable
            testID="home-settings"
            accessibilityRole="button"
            accessibilityLabel={t('home.openSettings')}
            hitSlop={8}
            style={({ pressed }) => [styles.gear, pressed && styles.pressed]}>
            {/* U+FE0E asks for the text glyph, not the emoji. */}
            <Text style={styles.gearIcon} importantForAccessibility="no">
              {'⚙︎'}
            </Text>
          </Pressable>
        </Link>
      </View>
      <View style={styles.container}>
        <Text style={styles.title}>{t('home.title')}</Text>
        <Text style={styles.subtitle}>{t('home.tagline')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: rt.insets.top,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.sm,
  },
  gear: {
    width: theme.touch.minTarget,
    height: theme.touch.minTarget,
    borderRadius: theme.touch.minTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pressed: {
    opacity: 0.7,
  },
  gearIcon: {
    fontSize: 24,
    lineHeight: 28,
    color: theme.colors.text,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.sm,
    paddingHorizontal: theme.space.xl,
  },
  title: {
    ...theme.type.display,
    color: theme.colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
}));
