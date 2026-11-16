/**
 * The sign-in sheet (#401, look from Figma frame 09, #519): "Play online",
 * one line under it and a close button (`SignInHeader`), then the sign-in
 * choices (`SignInChoices`). Play a friend shows it when "Make an invite"
 * finds no saved session. The close button (Not now), a tap on the dimmed
 * part and the Android back button close it and sign in nothing.
 *
 * It is a `Sheet` (a `Modal`), so screen readers stay in it; focus moves
 * to its title. Show it only while it is needed (mount it then), so the
 * focus moves each time it opens.
 *
 * The close button is in the header, which shows only with the choices:
 * on the email, username and problem steps the dimmed part is the screen
 * reader's close button again (`ownCloseButton` follows the header).
 *
 * Each time it opens it tells the reminders (#404, `sheetShown`): it is
 * an ask too, so Home shows no card the same day.
 */
import type { Analytics, AppleSheet, AuthProvider, AuthUser } from '@tavli/contracts';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Sheet } from '@/components/Sheet';
import { useFocusOnShow } from '@/features/accessibility/focus';
import { reminders } from '@/features/reminders/reminders';

import { SignInChoices } from './SignInChoices';
import { SignInHeader } from './SignInHeader';

export interface SignInSheetProps {
  auth: AuthProvider;
  onSignedIn: (user: AuthUser) => void;
  onClose: () => void;
  /** For tests. Default: the app's. */
  appleSheet?: AppleSheet;
  /** For tests. Default: the app's analytics. */
  analytics?: Analytics;
}

export function SignInSheet({
  auth,
  onSignedIn,
  onClose,
  appleSheet,
  analytics,
}: SignInSheetProps) {
  const { t } = useTranslation();
  const titleRef = useFocusOnShow();
  // The header's close button shows only with the choices. On the other
  // steps the dimmed part stays the screen reader's close button.
  const [headerShown, setHeaderShown] = useState(true);
  useEffect(() => {
    reminders.sheetShown();
  }, []);
  return (
    <Sheet
      visible
      onClose={onClose}
      closeLabel={t('signIn.notNow')}
      ownCloseButton={headerShown}
      testID="sign-in-sheet">
      <SignInChoices
        auth={auth}
        onSignedIn={onSignedIn}
        onHeaderShown={setHeaderShown}
        header={
          <SignInHeader
            title={t('signIn.title')}
            body={t('signIn.body')}
            titleRef={titleRef}
            onClose={onClose}
          />
        }
        {...(appleSheet === undefined ? {} : { appleSheet })}
        {...(analytics === undefined ? {} : { analytics })}
      />
    </Sheet>
  );
}
