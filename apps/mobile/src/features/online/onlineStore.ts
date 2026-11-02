/**
 * One online game on this phone (#254), over the `GameTransport` port.
 *
 * The server is the truth. The store subscribes to the game, and each new
 * view replaces the local flow. On your turn you play the roll here: each
 * move and undo goes through the engine (`applyMatchAction`) on the local
 * flow, as in `features/game/gameStore.ts`, and only the engine judges a
 * move. Confirm sends the whole turn (`sendTurn`). A `roll` asks the
 * server to roll (`rollDice`, #355): the server picks the dice, the phone
 * never does. Its view comes with the roll in the log (`rollResult.ts`),
 * so the screen plays it as a local roll. The opening of a new match is
 * the same (#379): a `rollOpening` of your side asks the server to roll
 * your opening die (`rollDice` again), while your die is not in yet. Its
 * view starts its log with that roll. The other player's die comes only
 * with the next view. The server passes a roll with no legal move and
 * starts the next game (its opening too) by itself, so the store refuses
 * those actions.
 *
 * The store follows the view: `view.waitingFor`, `view.prompt` and
 * `game.state.toMove`. It never assumes the players alternate (an Asodio
 * turn can give the same player another roll).
 *
 * Live moves (#374): after each move and undo of your turn the store
 * sends your turn so far (`setDraft`), best effort: one call at a time,
 * then only the newest draft. A draft that fails changes nothing (an old
 * server has no `setDraft`), and it never holds back a move, an undo or
 * Confirm. On the other player's turn a view with a newer draft (same
 * version, higher `seq`) replaces the flow: its moves are played on the
 * view (`draftFlow`), so the board shows them as they happen.
 *
 * See "Online games" in `docs/architecture/app-shell.md` and "Move flow"
 * in `docs/architecture/online-game-service.md`.
 */
import {
  isGameTransportErrorData,
  type GameTransport,
  type GameTransportErrorCode,
  type OnlineGameView,
} from '@tavli/contracts';
import {
  EngineError,
  MATCH_FLOW_SCHEMA_VERSION,
  applyMatchAction,
  type Dice,
  type DieValue,
  type MatchAction,
  type MatchFlow,
  type MoveInput,
  type PlayerId,
} from '@tavli/engine';
import { mayRollOpening, sideOf } from '@tavli/online';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { openingRollResult, rollResult } from './rollResult';
import { estimateOffset } from './timeLeft';

export interface OnlineStoreOptions {
  readonly transport: GameTransport;
  readonly gameId: string;
  /** The player id (account) of this phone. It finds your side in `view.players`. */
  readonly me: string;
  /** The phone clock, in epoch milliseconds. Default: `Date.now`. Tests pass a fake one. */
  readonly now?: () => number;
  /**
   * Sends your turn so far after each move and undo (#374). Default:
   * `true`. The online bot turns it off: its turn arrives whole.
   */
  readonly sendDrafts?: boolean;
}

/**
 * Something the screen can show once, then clear with `clearNotice`:
 * - `timedOut`: your time ran out before the turn reached the server. You
 *   lost that game, and your moves are gone.
 * - `stale`: the game changed on the server first (for example your other
 *   phone played). Your moves are gone; the store shows the newest view.
 * - `sendFailed`: the call did not reach the server (a network error).
 *   Your moves stay, so you can send again.
 * - `rollFailed`: your roll did not reach the server (a network error).
 *   Roll again.
 * - `refused`: the server refused the call for another reason
 *   (`lastError` says why). Your moves are gone.
 */
export type OnlineNotice = 'timedOut' | 'stale' | 'sendFailed' | 'rollFailed' | 'refused';

/** Why the game did not load: a server code (for example `NOT_FOUND`), or `network`. */
export type OnlineLoadError = GameTransportErrorCode | 'network';

export interface OnlineStoreState {
  /**
   * The newest view with the moves you played on it this turn. `null`
   * until the first view arrives. Its `log` holds only your roll (when
   * this store asked for it) and your local moves.
   */
  readonly flow: MatchFlow | null;
  /** The newest view from the server. `null` until it arrives. */
  readonly view: OnlineGameView | null;
  /** Your side in this game. `null` until the first view, or when `me` is not a player. */
  readonly side: PlayerId | null;
  /** Names this game on this store for this app run (`o1`, `o2`, …), like `GameStoreState.matchKey`. */
  readonly matchKey: string;
  /** The last action the store or the server refused, for logs and tests. `null` after a good one. */
  readonly lastError: string | null;
  /**
   * How many actions this store refused with no call. The same refusal
   * twice gives the same `lastError`; the count still changes, so the
   * board plays its "invalid move" feedback each time.
   */
  readonly refusals: number;
  /** Set when the game could not load. */
  readonly loadError: OnlineLoadError | null;
  /**
   * True from a call (roll, turn, answer, resign) until the server has it
   * and its new view is here, or until it fails. Every action is refused
   * meanwhile.
   */
  readonly sending: boolean;
  /** True while `sending` is a roll (#355): the screen says the dice are on their way. */
  readonly rolling: boolean;
  readonly notice: OnlineNotice | null;
  /**
   * How many notices this store has set, the newest included. It names
   * each notice, so a screen reader hears the same notice again when it
   * comes back (#255).
   */
  readonly noticeCount: number;
  /**
   * The estimated server time minus the phone time, in milliseconds. 0
   * for the first view; then the highest `estimateOffset` of the newer
   * versions. A view always arrives after its save, so each estimate is
   * at most the true offset: a late view (after a reconnect) cannot pull
   * it down. Pass it to `timeLeft`.
   */
  readonly clockOffset: number;
  /**
   * Plays one action of your side. Returns `false` (and keeps the flow)
   * when it is refused. `move` and `undo` stay on the phone. `roll`,
   * `rollOpening` (your opening die, #379), `confirm`, `answer` and
   * `resignMatch` start a call and return `true`;
   * the result arrives later (`sending`, `notice`, the next view). A
   * `move` with `autoConfirm` sends the turn as soon as it is complete.
   * Before your roll, move, undo and confirm do nothing (no refusal:
   * `refusals` stays), as a local game ignores a tap before the roll.
   */
  dispatch: (action: MatchAction) => boolean;
  clearNotice: () => void;
  /** Stops the subscription. The store ignores every later view and call result. */
  dispose: () => void;
}

export type OnlineStore = StoreApi<OnlineStoreState>;

let storeCount = 0;
const nextMatchKey = () => {
  storeCount += 1;
  return `o${storeCount}`;
};

/** The local flow of a view: the server flow with an empty log. */
export function viewFlow(view: OnlineGameView): MatchFlow {
  return { schemaVersion: MATCH_FLOW_SCHEMA_VERSION, match: view.match, game: view.game, log: [] };
}

/**
 * The flow of a view with the other player's draft (#374) played on it:
 * their moves so far, through the engine. Only while they move, never on
 * your turn (your moves are on the phone). A draft move the engine refuses
 * stops it there; the server checked every move already. The log stays
 * empty, so the screen reads it as a view.
 */
export function draftFlow(view: OnlineGameView, side: PlayerId | null): MatchFlow {
  const flow = viewFlow(view);
  const moves = view.draft?.moves ?? [];
  const player = view.game.state.toMove;
  if (moves.length === 0 || view.game.phase !== 'moving' || view.waitingFor === side) return flow;
  let drafted = flow;
  for (const move of moves) {
    try {
      drafted = applyMatchAction(drafted, { type: 'move', player, move });
    } catch (error) {
      if (!(error instanceof EngineError)) throw error;
      break;
    }
  }
  return { ...drafted, log: [] };
}

/** True when `next` brings the other player a newer draft of the same view (#374). */
function newerDraft(current: OnlineGameView, next: OnlineGameView, side: PlayerId | null): boolean {
  return (
    next.version === current.version &&
    side !== null &&
    next.waitingFor !== side &&
    (next.draft?.seq ?? 0) > (current.draft?.seq ?? 0)
  );
}

/** The server does these steps by itself. */
const SERVER_ACTIONS: ReadonlySet<MatchAction['type']> = new Set([
  'nextGame',
  'chooseStarter',
  'timeout',
]);

/** The moves of your turn so far, with only the fields the server takes. */
function playedMoves(flow: MatchFlow): MoveInput[] {
  return flow.game.played.map(({ from, to, die, capture }) => ({ from, to, die, capture }));
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isGameTransportErrorData(error)) return `${error.code}: ${error.message}`;
  return String(error);
}

export function createOnlineStore({
  transport,
  gameId,
  me,
  now = Date.now,
  sendDrafts = true,
}: OnlineStoreOptions): OnlineStore {
  let disposed = false;
  /**
   * The view of your last roll, with its dice. It is found in each new
   * view (`rollResult`), not in the call's answer: a roll can reach the
   * server while its answer is lost, and its view still plays as a roll.
   */
  let myRoll: { readonly version: number; readonly player: PlayerId; readonly dice: Dice } | null =
    null;
  /** The view of your opening die (#379), with its value: found like `myRoll`. */
  let myOpening: {
    readonly version: number;
    readonly player: PlayerId;
    readonly die: DieValue;
  } | null = null;
  /**
   * The flow of `view`. The view of your roll starts its log with the
   * roll, so the screen throws the dice and reads them as a local roll.
   * The view of your opening die starts it with that die (`rollOpening`),
   * so it sounds as a local opening roll.
   */
  const flowOf = (view: OnlineGameView): MatchFlow => {
    const flow = draftFlow(view, sideOf(view.players, me));
    if (myOpening !== null && myOpening.version === view.version) {
      return {
        ...flow,
        log: [{ type: 'rollOpening', player: myOpening.player, die: myOpening.die }],
      };
    }
    if (myRoll === null || myRoll.version !== view.version) return flow;
    return { ...flow, log: [{ type: 'roll', player: myRoll.player, dice: myRoll.dice }] };
  };
  /** True while a call waits for the server. */
  let inFlight = false;
  /**
   * The version a call was made on. After the call succeeds, `sending`
   * stays on until a newer view arrives, so you never act on the old one.
   */
  let sentOn: number | null = null;
  /** The best clock offset so far (see `clockOffset`), `null` before the first estimate. */
  let measured: number | null = null;
  /** True while a `setDraft` call waits for the server (#374). */
  let draftInFlight = false;
  /** The newest draft not sent yet: it goes when the call in flight ends. */
  let draftWaiting: { readonly version: number; readonly moves: MoveInput[] } | null = null;

  /**
   * Sends the newest waiting draft, unless one is in flight. A draft of an
   * older view, or one made while a call is on its way (your turn), is
   * dropped. Its result is not read: a draft is best effort.
   */
  const sendDraft = () => {
    if (draftInFlight || draftWaiting === null) return;
    const draft = draftWaiting;
    draftWaiting = null;
    const view = store.getState().view;
    if (disposed || inFlight || view === null || view.version !== draft.version) return;
    draftInFlight = true;
    const done = () => {
      draftInFlight = false;
      sendDraft();
    };
    let sent: Promise<void>;
    try {
      sent = transport.setDraft({ gameId, expectedVersion: draft.version, moves: draft.moves });
    } catch (error) {
      sent = Promise.reject(error);
    }
    sent.then(done, done);
  };

  const store = createStore<OnlineStoreState>()((set, get) => {
    const refuse = (message: string): false => {
      set((s) => ({ lastError: message, refusals: s.refusals + 1 }));
      return false;
    };

    /**
     * A move, undo or confirm before you rolled: nothing happens, with no
     * "invalid move" feedback (a local game ignores a tap before the roll).
     */
    const rollFirst = (): false => {
      set({ lastError: 'roll first' });
      return false;
    };

    /** Runs `action` through the engine. `null` (and `lastError`) when it refuses. */
    const engine = (flow: MatchFlow, action: MatchAction): MatchFlow | null => {
      try {
        return applyMatchAction(flow, action);
      } catch (error) {
        if (!(error instanceof EngineError)) throw error;
        refuse(error.message);
        return null;
      }
    };

    /** The flow of the newest view: your local moves are dropped. */
    const fresh = (): MatchFlow | null => {
      const { view } = get();
      return view === null ? null : flowOf(view);
    };

    const failed = (error: unknown, roll: boolean) => {
      if (isGameTransportErrorData(error)) {
        const notice: OnlineNotice =
          error.code === 'TIMED_OUT'
            ? 'timedOut'
            : error.code === 'STALE_VERSION'
              ? 'stale'
              : 'refused';
        set((s) => ({
          flow: fresh(),
          sending: false,
          rolling: false,
          notice,
          noticeCount: s.noticeCount + 1,
          lastError: errorText(error),
        }));
      } else {
        // A network error: keep the moves, so the player can send again.
        set((s) => ({
          sending: false,
          rolling: false,
          notice: roll ? 'rollFailed' : 'sendFailed',
          noticeCount: s.noticeCount + 1,
          lastError: errorText(error),
        }));
      }
    };

    const call = (version: number, send: () => Promise<void>, roll = false) => {
      inFlight = true;
      sentOn = version;
      // The turn (or the resign) goes: a draft that waits is old.
      draftWaiting = null;
      set({ sending: true, rolling: roll, notice: null, lastError: null });
      let started: Promise<void>;
      try {
        started = send();
      } catch (error) {
        started = Promise.reject(error);
      }
      started.then(
        () => {
          inFlight = false;
          if (disposed) return;
          const { view } = get();
          if (view !== null && view.version > version) {
            sentOn = null;
            set({ sending: false, rolling: false });
          }
          // Else `sending` stays on until the next view (`onView`).
        },
        (error: unknown) => {
          inFlight = false;
          sentOn = null;
          if (!disposed) failed(error, roll);
        },
      );
    };

    const sendTurn = (flow: MatchFlow, view: OnlineGameView) => {
      const moves = playedMoves(flow);
      call(view.version, () =>
        transport.sendTurn({ gameId, expectedVersion: view.version, moves }),
      );
    };

    return {
      flow: null,
      view: null,
      side: null,
      matchKey: nextMatchKey(),
      lastError: null,
      refusals: 0,
      loadError: null,
      sending: false,
      rolling: false,
      notice: null,
      noticeCount: 0,
      clockOffset: 0,

      dispatch: (action) => {
        if (SERVER_ACTIONS.has(action.type)) {
          return refuse(`the server does "${action.type}" by itself`);
        }
        if (disposed) return refuse('the game is closed');
        const { flow, view, side, sending } = get();
        if (flow === null || view === null) return refuse('the game has not loaded yet');
        if (side === null) return refuse('you are not a player in this game');
        if (sending) return refuse('wait: the last call is still on its way');
        if (!('player' in action) || action.player !== side) {
          return refuse(`you play ${side}`);
        }
        if (view.status === 'finished') return refuse('the match is over');
        // Your turn waits for your roll (#355).
        const rollWaits =
          view.waitingFor === side &&
          view.prompt === null &&
          view.game.phase === 'awaiting-roll' &&
          view.game.state.toMove === side;

        switch (action.type) {
          case 'roll':
            // The server rolls: the phone never picks a die.
            if (action.dice !== undefined) return refuse('the server rolls the dice');
            if (!rollWaits) return refuse('there is no roll to make');
            call(
              view.version,
              () => transport.rollDice({ gameId, expectedVersion: view.version }),
              true,
            );
            return true;
          case 'rollOpening':
            // Your opening die (#379): the server rolls it, also when the
            // other player rolled first. A server that rolls the opening
            // itself (before #379) never waits for it.
            if (action.die !== undefined) return refuse('the server rolls the dice');
            if (!mayRollOpening(view, side)) return refuse('there is no opening die to roll');
            call(
              view.version,
              () => transport.rollDice({ gameId, expectedVersion: view.version }),
              true,
            );
            return true;
          case 'resignMatch':
            call(view.version, () => transport.resign(gameId));
            return true;
          case 'resign':
            return refuse('online, you resign the whole match');
          case 'move':
          case 'undo': {
            if (rollWaits) return rollFirst();
            if (view.waitingFor !== side) return refuse('it is not your turn');
            // Auto confirm is done here, by sending the turn, not by the engine.
            const local: MatchAction =
              action.type === 'move' ? { type: 'move', player: side, move: action.move } : action;
            const next = engine(flow, local);
            if (next === null) return false;
            set({ flow: next, lastError: null });
            if (
              action.type === 'move' &&
              action.autoConfirm === true &&
              next.game.phase === 'awaiting-confirm'
            ) {
              sendTurn(next, view);
            } else if (sendDrafts) {
              // The other phone shows the turn so far (#374).
              draftWaiting = { version: view.version, moves: playedMoves(next) };
              sendDraft();
            }
            return true;
          }
          case 'confirm':
            if (rollWaits) return rollFirst();
            if (view.waitingFor !== side) return refuse('it is not your turn');
            // The engine checks that the turn is complete; its result is not kept.
            if (engine(flow, action) === null) return false;
            sendTurn(flow, view);
            return true;
          case 'answer': {
            if (view.prompt === null || view.prompt.player !== side) {
              return refuse('there is no question for you');
            }
            if (engine(flow, action) === null) return false;
            const { choice } = action;
            call(view.version, () =>
              transport.sendAnswer({ gameId, expectedVersion: view.version, choice }),
            );
            return true;
          }
          default:
            return refuse(`"${action.type}" is not an online action`);
        }
      },

      clearNotice: () => set({ notice: null }),

      dispose: () => {
        if (disposed) return;
        disposed = true;
        unsubscribe();
      },
    };
  });

  const onView = (view: OnlineGameView) => {
    if (disposed) return;
    const current = store.getState().view;
    if (current !== null && view.version <= current.version) {
      // The other player's newer draft (#374): the same view with more of
      // their turn. Nothing else changed (no clock estimate, no call ends).
      const side = store.getState().side;
      if (newerDraft(current, view, side)) store.setState({ view, flow: flowOf(view) });
      // Else the same or an older version (a repeat, or out of order):
      // keep the local moves.
      return;
    }
    // The first view may be old (the game was opened later): no estimate.
    const estimate = current === null ? null : estimateOffset(view, now());
    if (estimate !== null) measured = measured === null ? estimate : Math.max(measured, estimate);
    const done = !inFlight && sentOn !== null && view.version > sentOn;
    if (done) sentOn = null;
    const side = sideOf(view.players, me);
    // The view of your roll: its dice go in the log. Only your own roll
    // leads to it, also when the call's answer was lost (then the
    // "did not reach the server" notice was wrong, and it closes).
    const dice = current === null || side === null ? null : rollResult(current, view, side);
    if (dice !== null && side !== null) myRoll = { version: view.version, player: side, dice };
    // Your opening die (#379), the same way.
    const die = current === null || side === null ? null : openingRollResult(current, view, side);
    if (die !== null && side !== null) myOpening = { version: view.version, player: side, die };
    const rollFailed = (dice !== null || die !== null) && store.getState().notice === 'rollFailed';
    store.setState({
      view,
      flow: flowOf(view),
      side,
      loadError: null,
      ...(measured === null ? {} : { clockOffset: measured }),
      ...(done ? { sending: false, rolling: false } : {}),
      ...(rollFailed ? { notice: null } : {}),
    });
  };

  const onError = (error: unknown) => {
    if (disposed) return;
    store.setState({
      loadError: isGameTransportErrorData(error) ? error.code : 'network',
      lastError: errorText(error),
    });
  };

  const unsubscribe = transport.subscribe(gameId, onView, onError);
  return store;
}

/** Reads the store in a component. */
export function useOnlineStore<T>(store: OnlineStore, selector: (state: OnlineStoreState) => T): T {
  return useStore(store, selector);
}
