/**
 * How to play a game: `/rules/portes`, `/rules/plakoto`, `/rules/fevga`,
 * `/rules/asodio` and `/rules/tavli`. Each game's page opens its lessons.
 * `?version=` names a rules version that is not the default (#241).
 */
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { rulesHref, tutorialHref } from '@/features/match/routes';
import { parseRulesVariant, parseRulesVersion, rulesTitleKey } from '@/features/rules/content';
import { RulesScreen } from '@/features/rules/RulesScreen';

export default function RulesRoute() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ variant?: string; version?: string }>();
  const variant = parseRulesVariant(params.variant);
  const version = parseRulesVersion(variant, params.version);
  return (
    <>
      <Stack.Screen options={{ title: t(rulesTitleKey(variant)) }} />
      <RulesScreen
        variant={variant}
        version={version}
        onOpenRules={(game) => router.push(rulesHref(game))}
        onLearnToPlay={(game) => router.push(tutorialHref('rules', game))}
      />
    </>
  );
}
