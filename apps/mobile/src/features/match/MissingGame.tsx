/** "This game could not be opened." with a Home button: an unknown id or a broken save. */
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { ActionButton } from '@/components/ActionButton';
import { GameCard } from '@/features/game/GameCard';

export function MissingGame({ onHome }: { onHome: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.screen}>
      <GameCard testID="game-missing" title={t('game.missing.title')}>
        <ActionButton label={t('game.missing.home')} onPress={onHome} />
      </GameCard>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    paddingTop: rt.insets.top,
  },
}));
