/**
 * How to play (#571): the hub with every game's lessons and rules. Home's
 * How to play link and Settings → Help open it. Its screen draws its own
 * header, so the stack header is off.
 */
import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { rulesHref, tourHref } from '@/features/match/routes';
import { HowToPlayScreen } from '@/features/rules/HowToPlayScreen';
import { useLessonProgress } from '@/features/tutorial/store';

export default function HowToPlayRoute() {
  const { t } = useTranslation();
  const progress = useLessonProgress();
  return (
    <>
      <Stack.Screen options={{ title: t('rules.hub.title'), headerShown: false }} />
      <HowToPlayScreen
        progress={progress}
        onOpen={(variant) => router.push(rulesHref(variant))}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        onTour={() => router.push(tourHref('rules'))}
      />
    </>
  );
}
