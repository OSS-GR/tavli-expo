/**
 * How to play (a stub until the rules pages are written). Only Portes is
 * playable in MVP1; other ids show the same short text.
 */
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export default function RulesRoute() {
  const { t } = useTranslation();
  const game = t('games.portes');
  return (
    <>
      <Stack.Screen options={{ title: t('rules.title', { game }) }} />
      <ScrollView
        testID="rules-screen"
        style={styles.screen}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic">
        <Text style={styles.body}>{t('rules.portes')}</Text>
        <Text style={styles.hint}>{t('rules.soon')}</Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    gap: theme.space.lg,
    padding: theme.space.xl,
  },
  body: {
    ...theme.type.body,
    color: theme.colors.text,
  },
  hint: {
    ...theme.type.caption,
    color: theme.colors.textDim,
  },
}));
