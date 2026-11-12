/**
 * Settings → Gameplay (#501): the switches of a game (no icon squares: the
 * label carries the meaning), Bot speed, and Accessibility → Move list,
 * which opens its own page.
 */
import { useTranslation } from 'react-i18next';

import { SectionCard, SectionRow } from '@/components/SectionCard';
import { SegmentedControl, type SegmentOption } from '@/components/settings/SegmentedControl';
import { ToggleRow } from '@/components/settings/ToggleRow';
import type { BotSpeed } from '@/features/bot/botSpeed';

import { BlockHint } from './SettingBlock';
import { SettingsPage } from './SettingsPage';
import { useSettings } from './store';

export interface GameplaySettingsProps {
  onBack?: () => void;
  /** Opens Settings → Move list. */
  onMoveList?: () => void;
}

export function GameplaySettings({ onBack, onMoveList }: GameplaySettingsProps) {
  const { t } = useTranslation();
  const autoConfirmMoves = useSettings((s) => s.autoConfirmMoves);
  const showHints = useSettings((s) => s.showHints);
  const offerFastForward = useSettings((s) => s.offerFastForward);
  const botSpeed = useSettings((s) => s.botSpeed);
  const moveList = useSettings((s) => s.moveList);
  const setSetting = useSettings((s) => s.setSetting);

  const botSpeedOptions: SegmentOption<BotSpeed>[] = [
    { value: 'slow', label: t('settings.botSpeed.slow') },
    { value: 'normal', label: t('settings.botSpeed.normal') },
    { value: 'fast', label: t('settings.botSpeed.fast') },
  ];

  return (
    <SettingsPage
      title={t('settings.gameplay.title')}
      onBack={onBack}
      testID="settings-gameplay-screen"
      backTestID="settings-gameplay-back">
      <SectionCard>
        <ToggleRow
          testID="settings-auto-confirm"
          label={t('settings.autoConfirm.label')}
          hint={t('settings.autoConfirm.hint')}
          value={autoConfirmMoves}
          onValueChange={(value) => setSetting('autoConfirmMoves', value)}
        />
        <ToggleRow
          testID="settings-hints"
          label={t('settings.hints.label')}
          hint={t('settings.hints.hint')}
          value={showHints}
          onValueChange={(value) => setSetting('showHints', value)}
        />
        <ToggleRow
          testID="settings-offer-fast-forward"
          label={t('settings.offerFastForward.label')}
          hint={t('settings.offerFastForward.hint')}
          value={offerFastForward}
          onValueChange={(value) => setSetting('offerFastForward', value)}
        />
      </SectionCard>

      <SectionCard title={t('settings.botSpeed.label')} padded>
        <SegmentedControl
          testID="settings-bot-speed"
          label={t('settings.botSpeed.label')}
          options={botSpeedOptions}
          value={botSpeed}
          onChange={(value) => setSetting('botSpeed', value)}
        />
        <BlockHint>{t(`settings.botSpeed.${botSpeed}Hint`)}</BlockHint>
      </SectionCard>

      <SectionCard title={t('settings.sections.accessibility')}>
        <SectionRow
          testID="settings-move-list-row"
          label={t('settings.moveList.label')}
          hint={t('settings.moveList.rowHint')}
          value={t(`settings.moveList.${moveList}`)}
          onPress={() => onMoveList?.()}
        />
      </SectionCard>
    </SettingsPage>
  );
}
