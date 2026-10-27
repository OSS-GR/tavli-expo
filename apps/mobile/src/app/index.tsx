import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ContinueCard } from '@/features/home/ContinueCard';
import { HomeScreen } from '@/features/home/HomeScreen';
import { LearnCard } from '@/features/home/LearnCard';
import { matchSessions } from '@/features/match/appSessions';
import { gameHref, newGameHref, rulesHref, tutorialHref } from '@/features/match/routes';
import type { SavedMatch } from '@/features/match/savedMatch';
import { continueSummary } from '@/features/match/summary';
import { offersTutorial } from '@/features/tutorial/progress';
import { useTutorial } from '@/features/tutorial/store';
import { botLevels } from '@/services';

interface SlotState {
  readonly saved: SavedMatch | null;
  readonly broken: boolean;
  readonly now: number;
}

/** Reads the save slot. A broken save is removed by `peek`, so its notice shows once. */
function readSlot(): SlotState {
  const result = matchSessions.peek();
  return {
    saved: result.kind === 'ok' ? result.saved : null,
    broken: result.kind === 'broken',
    now: Date.now(),
  };
}

export default function HomeRoute() {
  const { t } = useTranslation();
  const [slot, setSlot] = useState<SlotState>(readSlot);
  // Read it again each time Home shows (back from a game).
  useFocusEffect(
    useCallback(() => {
      // `broken` goes back to false here (the save is gone now). The toast
      // was shown already and keeps its own timer. A sticky `broken` would
      // show it again whenever the text changes (a language switch).
      setSlot(readSlot());
    }, []),
  );
  const { saved } = slot;
  const showLearn = offersTutorial(useTutorial((s) => s.status));
  const dismissLearn = useTutorial((s) => s.dismiss);

  return (
    <HomeScreen
      botLevels={botLevels.portes}
      notice={slot.broken ? t('home.continue.broken') : null}
      continueCard={
        saved ? (
          <ContinueCard
            summary={continueSummary(saved, t, slot.now)}
            onPress={() => router.push(gameHref(saved.id))}
          />
        ) : null
      }
      learnCard={
        showLearn ? (
          <LearnCard onStart={() => router.push(tutorialHref('home'))} onDismiss={dismissLearn} />
        ) : null
      }
      onNewGame={(mode) => router.push(newGameHref(mode))}
      onSettings={() => router.push('/settings')}
      onHowToPlay={() => router.push(rulesHref('portes'))}
      onHistory={() => router.push('/history')}
    />
  );
}
