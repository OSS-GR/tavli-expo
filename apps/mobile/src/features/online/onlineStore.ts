/**
 * One online game on this phone (#254), over the `GameTransport` port.
 *
 * The server is the truth. The store subscribes to the game, and each new
 * view replaces the local flow. On your turn you play the roll here: each
 * move and undo goes through the engine (`applyMatchAction`) on the local
 * flow, as in `features/game/gameStore.ts`, and only the engine judges a
 * move. Confirm sends the whole turn (`sendTurn`). The server rolls the
 * dice, passes, and starts the next game by itself, so the store refuses
 * those actions.
 *
 * The store follows the view: `view.waitingFor`, `view.prompt` and
 * `game.state.toMove`. It never assumes the players alternate (an Asodio
 * turn can give the same player another roll).
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
  type MatchAction,
  type MatchFlow,
  type MoveInput,
  type PlayerId,
} from '@tavli/engine';
import { sideOf } from '@tavli/online';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { estimateOffset } from './timeLeft';

export interface OnlineStoreOptions {
  readonly transport: GameTransport;
  readonly gameId: string;
  /** The player id (account) of this phone. It finds your side in `view.players`. */
  readonly me: string;
  /** The phone clock, in epoch milliseconds. Default: `Date.now`. Tests pass a fake one. */
  readonly now?: () => number;
}

/**
 * Something the screen can show once, then clear with `clearNotice`:
 * - `timedOut`: your time ran out before the turn reached the server. You
 *   lost that game, and your moves are gone.
 * - `stale`: the game changed on the server first (for example your other
 *   phone played). Your moves are gone; the store shows the newest view.
 * - `sendFailed`: the call did not reach the server (a network error).
 *   Your moves stay, so you can send again.
 * - `refused`: the server refused the call for another reason
 *   (`lastError` says why). Your moves are gone.
 */
export type OnlineNotice = 'timedOut' | 'stale' | 'sendFailed' | 'refused';

/** Why the game did not load: a server code (for example `NOT_FOUND`), or `network`. */
export type OnlineLoadError = GameTransportErrorCode | 'network';

export interface OnlineStoreState {
  /**
   * The newest view with the moves you played on it this turn. `null`
   * until the first view arrives. Its `log` holds only your local moves.
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
  /** Set when the game could not load. */
  readonly loadError: OnlineLoadError | null;
  /**
   * True from a call (turn, answer, resign) until the server has it and
   * its new view is here, or until it fails. Every action is refused
   * meanwhile.
   */
  readonly sending: boolean;
  readonly notice: OnlineNotice | null;
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
   * when it is refused. `move` and `undo` stay on the phone. `confirm`,
   * `answer` and `resignMatch` start a call and return `true`; the result
   * arrives later (`sending`, `notice`, the next view). A `move` with
   * `autoConfirm` sends the turn as soon as it is complete.
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

/** The server does these steps by itself. */
const SERVER_ACTIONS: ReadonlySet<MatchAction['type']> = new Set([
  'roll',
  'rollOpening',
  'nextGame',
  'chooseStarter',
  'timeout',
]);

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
}: OnlineStoreOptions): OnlineStore {
  let disposed = false;
  /** True while a call waits for the server. */
  let inFlight = false;
  /**
   * The version a call was made on. After the call succeeds, `sending`
   * stays on until a newer view arrives, so you never act on the old one.
   */
  let sentOn: number | null = null;
  /** The best clock offset so far (see `clockOffset`), `null` before the first estimate. */
  let measured: number | null = null;

  const store = createStore<OnlineStoreState>()((set, get) => {
    const refuse = (message: string): false => {
      set({ lastError: message });
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
      return view === null ? null : viewFlow(view);
    };

    const failed = (error: unknown) => {
      if (isGameTransportErrorData(error)) {
        const notice: OnlineNotice =
          error.code === 'TIMED_OUT'
            ? 'timedOut'
            : error.code === 'STALE_VERSION'
              ? 'stale'
              : 'refused';
        set({ flow: fresh(), sending: false, notice, lastError: errorText(error) });
      } else {
        // A network error: keep the moves, so the player can send again.
        set({ sending: false, notice: 'sendFailed', lastError: errorText(error) });
      }
    };

    const call = (version: number, send: () => Promise<void>) => {
      inFlight = true;
      sentOn = version;
      set({ sending: true, notice: null, lastError: null });
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
            set({ sending: false });
          }
          // Else `sending` stays on until the next view (`onView`).
        },
        (error: unknown) => {
          inFlight = false;
          sentOn = null;
          if (!disposed) failed(error);
        },
      );
    };

    const sendTurn = (flow: MatchFlow, view: OnlineGameView) => {
      const moves: MoveInput[] = flow.game.played.map(({ from, to, die, capture }) => ({
        from,
        to,
        die,
        capture,
      }));
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
      loadError: null,
      sending: false,
      notice: null,
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

        switch (action.type) {
          case 'resignMatch':
            call(view.version, () => transport.resign(gameId));
            return true;
          case 'resign':
            return refuse('online, you resign the whole match');
          case 'move':
          case 'undo': {
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
            }
            return true;
          }
          case 'confirm':
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
    // Same or older version (a repeat, or out of order): keep the local moves.
    if (current !== null && view.version <= current.version) return;
    // The first view may be old (the game was opened later): no estimate.
    const estimate = current === null ? null : estimateOffset(view, now());
    if (estimate !== null) measured = measured === null ? estimate : Math.max(measured, estimate);
    const done = !inFlight && sentOn !== null && view.version > sentOn;
    if (done) sentOn = null;
    store.setState({
      view,
      flow: viewFlow(view),
      side: sideOf(view.players, me),
      loadError: null,
      ...(measured === null ? {} : { clockOffset: measured }),
      ...(done ? { sending: false } : {}),
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
