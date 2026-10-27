# Analytics events

> Event plan for usage analytics (issue #61, ADR-0003; reviewed in #163). `ANALYTICS_EVENTS` and `AnalyticsEvents` in `packages/contracts/src/analytics.ts` are the one list of events and properties in code. Change the code and this page together. Tests check that the code sends only events from the list, that the app sends every event in the list, and that this page lists the same events. Last review: 2026-10-27 (#163).

## Goal

See which modes and features players use, where they stop, and if they come back. Nothing more. We do not track people.

The three questions:

1. **Mode use.** Which games, modes, bot levels, match lengths, themes and settings do players pick?
2. **Drop-off.** Where do players stop: in the tutorial, in a game, in a match?
3. **Return rate.** Do players come back the next day, the next week, the next month?

## Privacy rules (GDPR)

- **One switch for analytics and crash reports.** The consent answer lives in `apps/mobile/src/features/privacy/` (`consent.ts`, `consentStore.ts`). Analytics and crash reports (#43) both follow it:

  | Answer | Usage events | Crash reports |
  |--------|--------------|---------------|
  | Not answered yet | none | JS errors only, with no user id and no other id (no native crash reports, no sessions) |
  | **Allow usage data** | sent, with the install ID | sent, with the install ID, plus native crash reports and Sentry release-health sessions |
  | **Don't allow** | none | none |
  | **Don't allow** to an older consent text, not answered again yet | none | none |

- **Crash reports before the answer are JS only (#139).** Sentry's native SDKs put their own installation id on every native event and session, and the app cannot strip it. So before "Allow" the Sentry adapter does not start them. Details: `packages/adapters/crash-sentry/README.md` ("Anonymous mode").
- **New consent text asks again.** The answer is saved with `CONSENT_VERSION`. An answer saved for another version shows the welcome flow again. Until the new answer, an old **Allow** counts as "not answered yet" (`unset`: anonymous crash reports, no usage data). An old **Don't allow** stays a "no" (`stale-denied`: no crash reports, no usage data). Raise it only when the text changes so much that users must answer again.
- **No events before opt-in.** The first launch asks (wireframe 02). Until the user taps **Allow usage data**, the `Analytics` port drops every call. Closing the app without an answer counts as "no".
- **Opt-out stops everything at once.** Settings → Privacy → **Share anonymous usage data** calls `optOut()`. Nothing new is captured, and the PostHog adapter empties the event queue, so events captured before the opt-out are not uploaded after it. (A batch already on its way to the server when the user taps the switch cannot be stopped.)
- **No personal data.** No names, emails, usernames or contacts. Player names in pass-and-play are never sent. Settings events send the **key only**, never the value.
- **Random install ID.** `identify()` gets the anonymous install ID (`features/install-id`, shared with crash reports, #43). It is a random UUID, not linked to an account or the device. Adapters drop any ID that fails `isAnonymousInstallId` (an email, a name).
- **Screen names are route patterns** (`/settings`, `/game/[id]`), never URLs with IDs.
- **PostHog EU cloud.** No session replay, no touch autocapture, no app lifecycle events, no feature flags, no surveys, no GeoIP. The SDK makes no network calls of its own before opt-in.

## Events

Every event also carries PostHog's standard properties (`$lib`, `$os_name`, `$os_version`, `$locale`, `$timezone`, `$app_version`).

Every property value is a number, or a short id from a fixed set (the lists below). No property holds a name, an email or text that the player typed. The types in `AnalyticsEvents` allow only strings, numbers and booleans (no objects, no lists).

| Event | When it fires | Properties | Sent from |
|-------|---------------|------------|-----------|
| `app_opened` | Once per cold start, after consent. On the first launch it fires right after **Allow**. | none | `features/analytics/connect.ts` (`appOpened`, root layout) |
| `game_started` | A game begins: a new match, the next game of a match, or a rematch. Not sent when a saved match is resumed (it started before). | `mode`: `bot` \| `local` (`online` is kept for MVP2; nothing sends it yet); `game`: the game picked for the match, `portes` \| `plakoto` \| `fevga` \| `tavli` (Portes, Plakoto and Fevga in turn) \| `asodio`; `variant`: the game in play, engine id `portes` \| `plakoto` \| `fevga` \| `asodio`; `matchLength`: points to win (1, 3, 5, 7); `botLevel`: `easy` \| `medium` \| `hard` (only for `bot`) | game store (`createGameStore({ analytics })`), set for every match in `features/match/appSessions.ts` |
| `game_finished` | A game ends: last checker borne off, mother pinned, a resign, a draw, a time-out (an online turn timer ran out), or the match is resigned mid-game. | `mode`; `game`; `variant`; `result`: `mono` \| `diplo` \| `resign` \| `draw` \| `timeout`; `turns`: turns played; `durationSec`: seconds since `game_started` (left out for the game in play of a resumed match: its start time is not saved) | game store |
| `game_abandoned` | The player starts a new match while a game is not over (in memory or saved). | `mode`; `game`; `variant`; `turn`: turn number when they left | `features/match/sessions.ts` (`start`) |
| `undo_used` | The engine accepted an undo. | none | game store |
| `resign` | A player resigned the game or the match. | none | game store |
| `settings_changed` | A setting changed, except the two themes. | `key`: the setting name (`sound`, `haptics`, `language`, `autoConfirmMoves`, `showPipCounts`, `boardFlipMode`, `homeBoardSide`, `boardLayout`, `moveList`, `botSpeed`). Never the value. | `features/analytics/connect.ts` |
| `theme_changed` | The app colors (the `theme` setting) or the board theme (the `boardTheme` setting) changed. | `kind`: `app` \| `board`; `theme`: the theme id from the bundled list (board: `walnut-kafeneio`, `olive-inlay`, `kafeneio-night`; app colors: `walnut-kafeneio`) | `features/analytics/connect.ts` |
| `tutorial_started` | The tutorial (#128) opens. | `source`: `home` \| `rules` \| `settings` (where it was opened); `game`: `portes` \| `plakoto` \| `fevga` \| `asodio` (the lesson set, #149, #159) | `app/tutorial.tsx` through `features/tutorial/tutorialAnalytics.ts` |
| `tutorial_step` | A lesson of the tutorial is learnt (before **Next**). | `game`; `step`: 1–7 (Portes) or 1–4 (Plakoto, Fevga, Asodio); `lesson`: lesson id (Portes: `move`, `bothDice`, `double`, `makePoint`, `hit`, `enter`, `bearOff`; Plakoto: `pin`, `pinned`, `mother`, `plakotoBearOff`; Fevga: `sameWay`, `holdPoint`, `runner`, `sixInARow`; Asodio: `aceDeuce`, `enterAll`, `quarterLock`, `pinLast`) | same |
| `tutorial_finished` | The last lesson is learnt and the end card shows. | `game` | same |
| `tutorial_skipped` | **Skip** is tapped. | `game`; `step`: the lesson on screen, from 1; `lesson`: its id | same |
| `review_opened` | The game review (#215) opens: **Review** on the game-end sheet or the match-end screen of an offline game (vs bot or pass-and-play). Once per open. | `game`: the game picked for the match (as in `game_started`). Never the position, the dice, the moves or the mistakes. | `app/game/[id]/review.tsx` through `features/review/reviewAnalytics.ts` |
| `$screen` | A route change. | screen name = route pattern: `/`, `/new-game`, `/game/[id]`, `/game/[id]/match-end`, `/game/[id]/review`, `/history`, `/settings`, `/tutorial`, `/rules/[variant]`, `/welcome/language`, `/welcome/privacy` | `features/analytics/useAppAnalytics.ts` |

Notes:

- `game` and `variant`: for a one-game match they are the same. In a Tavli match `game` is `tavli` and `variant` is the game in play, so it changes from game to game. Use `game` to count Tavli matches, and `variant` to see how each of the four games plays. (`game` was added in #163: before it, a Tavli match looked like a Portes match.)
- `game_started` counts **games**, not matches. A 5-point match sends one `game_started` per game, and the first game of a match looks the same as the next one.
- `result`: `mono` is 1 point, `diplo` is 2 or more (a "backgammon" counts as diplo, `docs/rules/portes.md`). `draw` was added to the plan for Plakoto "both mothers pinned" and Asodio deadlock. `timeout` (#170) is a game lost because an online turn timer ran out, whatever its points; it sends no `resign` event. Nothing sends it until online play is wired to the app. The events do not say who won.
- `turns` counts finished turns. A resign in the middle of turn 5 gives `turns: 4`.
- `durationSec` is wall-clock time from `game_started`, so it includes time in the background. A match resumed after an app restart sends no `game_started`, and the save has no start time, so that game's `game_finished` has no `durationSec`. The next game of the match has it again.
- The "Share usage data" switch is **not** a setting in this sense: changing it sends no event.
- Tutorial events say nothing about the player. The "tutorial done or dismissed" status itself stays on the phone (`features/tutorial/progress.ts`) and needs no consent; only these events follow the consent answer, like every other event.
- `game_abandoned`: leaving the board (Home, the app in the background) is not abandoning, because the match is saved and can be continued (#36). Only a new match that replaces an unfinished one counts.
- `theme_changed` with `kind: app` cannot fire yet: the app has one set of colors. It is ready for more. Before #163 the board theme sent only `settings_changed` with `key: boardTheme`, so the dashboards could not see which board theme players pick.
- `review_opened` (#215) says only which game was reviewed. The review itself (the mistakes, how big they are) stays on the phone. Use it to see how many players look back at their games.
- The match history (#142) sends no event of its own. Only its screen view (`/history`) is sent.
- Nothing is sent before **Allow usage data**. So the events cannot show drop-off in the welcome flow, and every number counts only the players who said yes.

## The question each event answers

| Question | Events, and what they tell |
|----------|----------------------------|
| **Mode use** | `game_started`: which games (`game`), modes (`mode`), bot levels (`botLevel`) and match lengths (`matchLength`) players pick. `tutorial_started`: how many players open a tutorial, and from where (`source`). `$screen`: which screens players open (history, rules, settings). |
| **Feature use** | `undo_used`: how much players take back moves. `review_opened`: how many players review their games, per game. `settings_changed`: which settings players change (`key`). `theme_changed`: which themes players pick (themes may become a paid extra, `docs/vision.md`). |
| **Drop-off** | `game_started` → `game_finished`: how many games end. `game_abandoned`: which games players leave, and how early (`turn`). `resign` and `result: resign`: how often players give up. `tutorial_step`, `tutorial_finished`, `tutorial_skipped`: the lesson where players stop. |
| **Return rate** | `app_opened`: active players per day and week, and how many come back (retention). `game_started` after `game_finished`: players who come back to play. |

## Dashboards (the owner builds them in PostHog)

Make three dashboards in PostHog (Dashboards → New dashboard). Each line below is one insight. "Users" means unique users. A user is one install ID, so a reinstall counts as a new user. To leave out your own test builds, filter by `$app_version`.

### 1. Mode use

| Insight | Type | Set up |
|---------|------|--------|
| Games per game | Trends | Event `game_started`, total count, breakdown by `game`, weekly |
| Players per game | Trends | Event `game_started`, unique users, breakdown by `game`, weekly |
| Vs bot or pass-and-play | Trends (pie) | Event `game_started`, breakdown by `mode` |
| Bot levels | Trends (bar) | Event `game_started`, filter `mode = bot`, breakdown by `botLevel` |
| Match lengths | Trends (bar) | Event `game_started`, breakdown by `matchLength` |
| Tutorial opens | Trends | Event `tutorial_started`, breakdown by `game`; a copy by `source` |
| Board themes | Trends (bar) | Event `theme_changed`, filter `kind = board`, breakdown by `theme` |
| Settings | Trends (bar) | Event `settings_changed`, breakdown by `key` |
| Undo per game | Trends (formula) | A = `undo_used` count, B = `game_started` count, formula `A / B` |
| Screens | Trends (bar) | Event `$screen`, breakdown by screen name |

### 2. Drop-off

| Insight | Type | Set up |
|---------|------|--------|
| Games that end | Funnel | `game_started` → `game_finished`, conversion window 1 day, breakdown by `game`; a copy by `mode` |
| Games left | Trends (formula) | A = `game_abandoned` count, B = `game_started` count, formula `A / B`, breakdown by `game` |
| How games end | Trends (bar) | Event `game_finished`, breakdown by `result`; a copy by `game` |
| Game length | Trends | Event `game_finished`, property `durationSec`, median, breakdown by `variant` |
| Tutorial funnel | Funnel | `tutorial_started` → `tutorial_step` with `step = 1` → `step = 2` → … → `tutorial_finished`, filter `game = portes` on every step (7 steps). Make one more per lesson set (Plakoto, Fevga: 4 steps). |
| Tutorial skips | Trends (bar) | Event `tutorial_skipped`, breakdown by `lesson`, filter by `game` |
| First game | Funnel | `app_opened` → `game_started` → `game_finished`, conversion window 1 day, new users only (step 1 "first time for user") |

### 3. Return rate

| Insight | Type | Set up |
|---------|------|--------|
| Retention | Retention | Start event `app_opened` (first time), return event `app_opened`, weekly; a copy daily (day 1, day 7) |
| Back to play | Retention | Start event `game_finished` (first time), return event `game_started`, weekly |
| Active players | Trends | Event `app_opened`, unique users, daily and weekly |
| Stickiness | Stickiness | Event `app_opened`, days per week |
| New, returning, dormant | Lifecycle | Event `app_opened`, weekly |

## Where the code is

| Part | Path |
|------|------|
| Port, event types, no-op and recording adapters | `packages/contracts/src/analytics.ts` |
| Port contract checks (any test runner) | `packages/contracts/src/testing/analytics-contract.ts` (`@tavli/contracts/testing`) |
| PostHog adapter | `packages/adapters/analytics-posthog` |
| Adapter choice (`EXPO_PUBLIC_POSTHOG_KEY`, else no-op) | `apps/mobile/src/services.ts` |
| Consent answer and store (the one privacy switch) | `apps/mobile/src/features/privacy/` |
| App wiring, game helper, screen tracking | `apps/mobile/src/features/analytics/` |
| Tutorial helper | `apps/mobile/src/features/tutorial/tutorialAnalytics.ts` |
| Tests: the doc and the list (`ANALYTICS_EVENTS`) agree | `packages/contracts/src/analytics.test.ts` |
| Tests: the code sends only listed events, every listed event is sent, only the adapter calls PostHog | `apps/mobile/src/features/analytics/eventPlan.test.ts` |
| First-launch screens (language, consent) | `apps/mobile/src/features/welcome/`, routes `app/welcome/*` |

## Setup (owner)

1. Create a free PostHog project in the **EU** region (eu.posthog.com).
2. Copy the **project API key** (starts with `phc_`). It is a public key.
3. Set it as `EXPO_PUBLIC_POSTHOG_KEY`: in `apps/mobile/.env.local` for local builds, and as an EAS environment variable (visibility "plain text" is fine) for test builds.
4. In PostHog project settings, turn on **Discard client IP data**.
5. Without a key the app uses the no-op adapter and logs once in dev: `[analytics] EXPO_PUBLIC_POSTHOG_KEY is not set`.

To check: install a test build, tap **Allow usage data**, play a game vs the bot, and look for `app_opened`, `$screen`, `game_started` and `game_finished` in PostHog → Activity.

## Adding an event

1. Add it to `AnalyticsEvents` and `ANALYTICS_EVENTS` in `packages/contracts/src/analytics.ts`.
2. Add a row to the Events table, and say which question it answers (the docs test fails until the row is there). Add it to a dashboard.
3. Send it from a store or a small helper, not from deep inside a component. Write `analytics.track('event_name', …)` with the name as a string literal: `eventPlan.test.ts` reads the source and checks every name against the list. Wrap the call so an error never breaks the app (`quietly()` or `send()` in the helpers).
4. Never send names, emails or free text. Use numbers and ids from a fixed set only.
5. When the event tells something new, also update the privacy policy (`docs/legal/`, all four files) and the store answers (`docs/store/app-privacy.md`, `docs/store/play-data-safety.md`).
