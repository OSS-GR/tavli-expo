/**
 * The "Learn to play" row of Settings → Help (#159). It opens a sheet with
 * every game that has lessons: Portes, Plakoto, Fevga and Asodio. Picking
 * one closes the sheet and opens that game's lessons.
 *
 * The sheet scrolls, so with a large font or on a small phone no button
 * falls off the screen.
 */
import type { TutorialGame } from '@tavli/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { Sheet } from '@/components/Sheet';
import { TUTORIAL_GAMES } from '@/features/match/routes';

export interface TutorialSettingsProps {
  /** Opens the lessons of `game`. */
  onOpen: (game: TutorialGame) => void;
}

export function TutorialSettings({ onOpen }: TutorialSettingsProps) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState(false);
  const close = () => setPicking(false);

  return (
    <>
      <Pressable
        testID="settings-learn-to-play"
        accessibilityRole="button"
        onPress={() => setPicking(true)}
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
        <Text style={styles.linkText}>{`${t('settings.learnToPlay')} ›`}</Text>
      </Pressable>
      <Sheet visible={picking} onClose={close} closeLabel={t('common.cancel')}>
        <ScrollView
          testID="tutorial-picker"
          style={styles.scroll}
          contentContainerStyle={styles.picker}>
          <Text style={styles.heading} accessibilityRole="header">
            {t('settings.learnToPlayPicker.title')}
          </Text>
          <Text style={styles.body}>{t('settings.learnToPlayPicker.body')}</Text>
          {TUTORIAL_GAMES.map((game) => (
            <ActionButton
              key={game}
              testID={`tutorial-picker-${game}`}
              kind="secondary"
              label={t(`games.${game}`)}
              onPress={() => {
                close();
                onOpen(game);
              }}
            />
          ))}
          <ActionButton
            testID="tutorial-picker-cancel"
            kind="text"
            label={t('common.cancel')}
            onPress={close}
          />
        </ScrollView>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  link: {
    minHeight: theme.touch.row,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  linkText: {
    ...theme.type.body,
    color: theme.colors.text,
    textDecorationLine: 'underline',
  },
  scroll: {
    flexGrow: 0,
  },
  picker: {
    gap: theme.space.sm,
  },
  heading: {
    ...theme.type.title,
    color: theme.colors.text,
  },
  body: {
    ...theme.type.body,
    color: theme.colors.textDim,
    paddingBottom: theme.space.xs,
  },
}));
