/**
 * The "Learn to play" row of Settings → Help (#159). It opens a sheet with
 * every game that has lessons: Portes, Plakoto, Fevga and Asodio. Picking
 * one closes the sheet and opens that game's lessons.
 *
 * The sheet scrolls (`Sheet` holds the `ScrollView`), so with a large font
 * or on a small phone no button falls off the screen.
 */
import type { TutorialGame } from '@tavli/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { SectionRow } from '@/components/SectionCard';
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
      <SectionRow
        testID="settings-learn-to-play"
        icon="graduation"
        iconLook="bare"
        label={t('settings.learnToPlay')}
        onPress={() => setPicking(true)}
      />
      <Sheet visible={picking} onClose={close} closeLabel={t('common.cancel')}>
        <View testID="tutorial-picker" style={styles.picker}>
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
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  picker: {
    gap: theme.space.sm,
  },
  heading: {
    ...theme.type.title2,
    color: theme.colors.text,
  },
  body: {
    ...theme.type.body,
    color: theme.colors.textDim,
    paddingBottom: theme.space.xs,
  },
}));
