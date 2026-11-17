/**
 * Download my data (#445): one card with one row on Settings → Account,
 * for a guest and a saved account. A tap asks the server for the copy
 * and opens the share sheet (`myDataShare.ts`). While it loads, the row
 * says so (and screen readers hear it) and takes no tap. A failure opens
 * the problem popup (`ProblemDialog`). Its own state, apart from
 * `useAccount`, so the account's actions and this one never mix.
 */
import type { OnlineData } from '@tavli/contracts';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share } from 'react-native';

import { ProblemDialog } from '@/components/Problem';
import { SectionCard, SectionRow } from '@/components/SectionCard';
import { useAnnouncement } from '@/features/game/useAnnouncement';

import { downloadMyData, type DownloadProblem, type ShareSheet } from './myDataShare';

export interface DownloadMyDataProps {
  readonly data: OnlineData;
  /** Another account action runs. */
  readonly disabled: boolean;
  /** The guest card's rows have bare icons (#519). */
  readonly iconLook?: 'badge' | 'bare';
}

const share: ShareSheet = (content) => Share.share(content);

export function DownloadMyData({ data, disabled, iconLook = 'badge' }: DownloadMyDataProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<DownloadProblem | null>(null);
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );
  useAnnouncement(busy ? t('account.download.busy') : null);

  const press = () => {
    if (busy) return;
    setBusy(true);
    void downloadMyData(data, share).then((found) => {
      if (!live.current) return;
      setBusy(false);
      setProblem(found);
    });
  };

  return (
    <>
      <SectionCard testID="account-download-card">
        <SectionRow
          testID="account-download"
          icon="share"
          iconLook={iconLook}
          label={t('account.download.label')}
          hint={busy ? t('account.download.busy') : t('account.download.hint')}
          disabled={disabled || busy}
          onPress={press}
        />
      </SectionCard>
      <ProblemDialog
        testID="account-download-problem"
        problem={
          problem === null
            ? null
            : {
                title: t(`account.download.problem.${problem}.title`),
                text: t(`account.download.problem.${problem}.text`),
              }
        }
        okLabel={t('problem.ok')}
        onOk={() => setProblem(null)}
      />
    </>
  );
}
