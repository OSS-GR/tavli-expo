import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ContinueCard } from '@/features/home/ContinueCard';
import { HomeScreen } from '@/features/home/HomeScreen';
import { matchSessions } from '@/features/match/appSessions';
import { gameHref, newGameHref, rulesHref } from '@/features/match/routes';
import type { SavedMatch } from '@/features/match/savedMatch';
import { continueSummary } from '@/features/match/summary';
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
      // Keep `broken` once set: the notice shows once (the save is gone now).
      const next = readSlot();
      setSlot((old) => ({ ...next, broken: old.broken || next.broken }));
    }, []),
  );
  const { saved } = slot;

  return (
    <HomeScreen
      botLevels={botLevels}
      notice={slot.broken ? t('home.continue.broken') : null}
      continueCard={
        saved ? (
          <ContinueCard
            summary={continueSummary(saved, t, slot.now)}
            onPress={() => router.push(gameHref(saved.id))}
          />
        ) : null
      }
      onNewGame={(mode) => router.push(newGameHref(mode))}
      onSettings={() => router.push('/settings')}
      onHowToPlay={() => router.push(rulesHref('portes'))}
    />
  );
}
