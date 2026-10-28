/**
 * A local match on the board screen: the board (GameScreen), the bot vs
 * the human, the in-game menu and the resign dialogs. Both modes get the
 * Hint button (#209): the screen passes the bot's Analyzer. When the match is
 * over it calls `onMatchOver` (the match-end screen, wireframe 9).
 *
 * Navigation stays in the route (`app/game/[id].tsx`); this screen only
 * calls the `on…` props.
 */
import type { Analyzer } from '@tavli/bot';
import type { BotRunner } from '@tavli/contracts';
import { opponent, type PlayerId } from '@tavli/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Sheet } from '@/components/Sheet';
import { BOT_SPEED_TIMING, type BotTiming } from '@/features/bot/botTurn';
import { useGameStore } from '@/features/game/gameStore';
import { GameScreen, type BotSeat } from '@/features/game/GameScreen';
import { winType } from '@/features/game/turnNotices';
import { sendHintShown } from '@/features/hint/hintAnalytics';
import { useSettings } from '@/features/settings/store';
import { analyzer as appAnalyzer, botRunner, createLocalRng } from '@/services';

import { GameMenu } from './GameMenu';
import { canResignGame, previewResign, resigningPlayer } from './resign';
import { seatsFor } from './seats';
import type { MatchSession } from './sessions';
import { BOT_SIDE } from './setup';
import { currentGameLabel, nextGameLabel, variantName } from './summary';

export interface MatchScreenProps {
  session: MatchSession;
  /** Another screen is on top (Settings): the bot waits. */
  paused?: boolean;
  onExit: () => void;
  onSettings: () => void;
  onRules: () => void;
  /** The match is over: open the match-end screen. */
  onMatchOver: () => void;
  /** "Review" on the game-end sheet: the review of the game that just ended (#215). */
  onReview?: () => void;
  /** For tests: another runner, or bot timing on top of the Bot speed setting. */
  runner?: BotRunner;
  botTiming?: Partial<BotTiming>;
  /** For tests: another Analyzer for the Hint button. */
  analyzer?: Analyzer;
}

type Overlay = 'none' | 'menu' | 'resignGame' | 'resignMatch';

export function MatchScreen({
  session,
  paused = false,
  onExit,
  onSettings,
  onRules,
  onMatchOver,
  onReview,
  runner = botRunner,
  botTiming,
  analyzer = appAnalyzer,
}: MatchScreenProps) {
  const { t } = useTranslation();
  const { setup, store } = session;
  const flow = useGameStore(store, (s) => s.flow);
  const dispatch = useGameStore(store, (s) => s.dispatch);
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [uiRng] = useState(() => createLocalRng());
  // A new speed applies from the bot's next turn.
  const botSpeed = useSettings((s) => s.botSpeed);

  const seats = seatsFor(setup, t);
  const name = (player: PlayerId) => seats[player].name;
  const bot: BotSeat | undefined =
    setup.mode === 'bot'
      ? {
          player: BOT_SIDE,
          difficulty: setup.botLevel,
          runner,
          rng: uiRng,
          timing: { ...BOT_SPEED_TIMING[botSpeed], ...botTiming },
        }
      : undefined;

  const game = t(`games.${setup.game}`);
  // The game on the board: the chosen game, or this game of the Tavli rotation.
  const playing = variantName(flow.game.state.variant, t);
  const gameLabel = currentGameLabel(flow, t);
  const nextLabel =
    flow.game.phase === 'game-over' && flow.match.status !== 'finished'
      ? nextGameLabel(flow.match, t)
      : undefined;
  const score = t('game.end.score', {
    white: name('white'),
    black: name('black'),
    whiteScore: flow.match.score.white,
    blackScore: flow.match.score.black,
  });
  const summary =
    setup.mode === 'bot'
      ? t('game.menu.summaryBot', { game, level: t(`bot.levels.${setup.botLevel}`), score })
      : t('game.menu.summaryLocal', { game, score });

  const resigner = resigningPlayer(flow, setup.mode);
  const gameResignable = canResignGame(flow, resigner);
  const close = () => setOverlay('none');

  let content = null;
  if (overlay === 'menu') {
    content = (
      <GameMenu
        gameLabel={gameLabel}
        summary={summary}
        resignGameHint={
          gameResignable ? t('game.menu.resignGameHint', { name: name(opponent(resigner)) }) : null
        }
        resignMatchHint={
          resigner !== null
            ? t('game.menu.resignMatchHint', { name: name(opponent(resigner)) })
            : null
        }
        rulesLabel={t('game.menu.rules', { game: playing })}
        onResignGame={() => setOverlay('resignGame')}
        onResignMatch={() => setOverlay('resignMatch')}
        onRules={() => {
          close();
          onRules();
        }}
        onSettings={() => {
          close();
          onSettings();
        }}
        exitHint={t('game.menu.exitHint')}
        onExit={() => {
          close();
          onExit();
        }}
        onResume={close}
      />
    );
  } else if (overlay === 'resignGame' && gameResignable) {
    const { result, score: after } = previewResign(flow, resigner);
    const winner = opponent(resigner);
    const type = winType(result, flow.game.state.rules.scoring.method);
    const you = seats[resigner].you;
    const vars = { winner: name(winner), loser: name(resigner), count: result.points };
    const body =
      type === 'points'
        ? t('game.resign.points', vars)
        : type === 'diplo'
          ? you
            ? t('game.resign.diplo_you', vars)
            : t('game.resign.diplo', vars)
          : you
            ? t('game.resign.mono_you', vars)
            : t('game.resign.mono', vars);
    content = (
      <ConfirmDialog
        testID="resign-game-dialog"
        title={t('game.resign.gameTitle')}
        lines={[body]}
        note={t('game.resign.after', {
          score: t('game.end.score', {
            white: name('white'),
            black: name('black'),
            whiteScore: after.white,
            blackScore: after.black,
          }),
          target: flow.match.targetPoints,
        })}
        confirmLabel={t('game.resign.confirm')}
        cancelLabel={t('game.resign.keep')}
        onConfirm={() => {
          dispatch({ type: 'resign', player: resigner });
          close();
        }}
        onCancel={close}
      />
    );
  } else if (overlay === 'resignMatch' && resigner !== null) {
    content = (
      <ConfirmDialog
        testID="resign-match-dialog"
        title={t('game.resign.matchTitle')}
        lines={[t('game.resign.matchBody', { winner: name(opponent(resigner)) })]}
        confirmLabel={t('game.resign.confirm')}
        cancelLabel={t('game.resign.keep')}
        onConfirm={() => {
          dispatch({ type: 'resignMatch', player: resigner });
          close();
        }}
        onCancel={close}
      />
    );
  }

  return (
    <>
      <GameScreen
        store={store}
        seats={seats}
        openingTaps={setup.mode === 'bot' ? 'one' : 'perPlayer'}
        {...(bot ? { bot } : {})}
        paused={paused || overlay !== 'none'}
        // The menu or a dialog is open: screen readers skip the game under it.
        covered={content !== null}
        onOpenMenu={() => setOverlay('menu')}
        onHome={onExit}
        onMatchOver={onMatchOver}
        {...(onReview ? { onReview } : {})}
        gameLabel={gameLabel}
        {...(nextLabel ? { nextGameLabel: nextLabel } : {})}
        analyzer={analyzer}
        onHintShown={() => sendHintShown(setup.game, flow.game.state.variant)}
      />
      <Sheet
        visible={content !== null}
        onClose={close}
        closeLabel={t('game.menu.resume')}
        look={overlay === 'menu' ? 'sheet' : 'dialog'}
        // The game screen turns with the phone (#185); its menu and dialogs too.
        turns>
        {content}
      </Sheet>
    </>
  );
}
