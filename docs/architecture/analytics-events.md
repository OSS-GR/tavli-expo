# Analytics events

> Event plan for usage analytics (issue #61, ADR-0003). The names and properties are typed in `packages/contracts/src/analytics.ts` (`AnalyticsEvents`). Change both together. A test checks that every event in the code is listed here. Last review: 2026-10-26.

## Goal

See which modes and features players use, from the first test builds. Nothing more. We do not track people.

## Privacy rules (GDPR)

- **One switch for analytics and crash reports.** The consent answer lives in `apps/mobile/src/features/privacy/` (`consent.ts`, `consentStore.ts`). Analytics and crash reports (#43) both follow it:

  | Answer | Usage events | Crash reports |
  |--------|--------------|---------------|
  | Not answered yet | none | sent, with no user id |
  | **Allow usage data** | sent, with the install ID | sent, with the install ID |
  | **Don't allow** | none | none |

- **No events before opt-in.** The first launch asks (wireframe 02). Until the user taps **Allow usage data**, the `Analytics` port drops every call. Closing the app without an answer counts as "no".
- **Opt-out stops everything at once.** Settings → Privacy → **Share anonymous usage data** calls `optOut()`. Events already queued from before the opt-out may still upload. Nothing new is captured.
- **No personal data.** No names, emails, usernames or contacts. Player names in pass-and-play are never sent. Settings events send the **key only**, never the value.
- **Random install ID.** `identify()` gets the anonymous install ID (`features/install-id`, shared with crash reports, #43). It is a random UUID, not linked to an account or the device. Adapters drop any ID that fails `isAnonymousInstallId` (an email, a name).
- **Screen names are route patterns** (`/settings`, `/game/[id]`), never URLs with IDs.
- **PostHog EU cloud.** No session replay, no touch autocapture, no app lifecycle events, no feature flags, no surveys, no GeoIP. The SDK makes no network calls of its own before opt-in.

## Events

Every event also carries PostHog's standard properties (`$lib`, `$os_name`, `$os_version`, `$locale`, `$timezone`, `$app_version`).

| Event | When it fires | Properties | Sent from |
|-------|---------------|------------|-----------|
| `app_opened` | Once per cold start, after consent. On the first launch it fires right after **Allow**. | none | `features/analytics/connect.ts` (`appOpened`, root layout) |
| `game_started` | A game begins: a new match, the next game of a match, or a rematch. | `mode`: `bot` \| `local` \| `online`; `variant`: engine id (`portes`, `plakoto`, `fevga`, `asodio`); `matchLength`: points to win; `botLevel`: `easy` \| `medium` \| `hard` (only for `bot`) | game store (`createGameStore({ analytics })`), set for every match in `features/match/appSessions.ts` |
| `game_finished` | A game ends: last checker borne off, mother pinned, a resign, a draw, or the match is resigned mid-game. | `mode`; `variant`; `result`: `mono` \| `diplo` \| `resign` \| `draw`; `turns`: turns played; `durationSec`: seconds since `game_started` | game store |
| `game_abandoned` | The player leaves a game that is not over. | `mode`; `variant`; `turn`: turn number when they left | **Not wired yet** (see below) |
| `undo_used` | The engine accepted an undo. | none | game store |
| `resign` | A player resigned the game or the match. | none | game store |
| `settings_changed` | A setting changed, except the theme. | `key`: the setting name (`sound`, `haptics`, `language`, `autoConfirmMoves`, `showPipCounts`, `boardFlipMode`) | `features/analytics/connect.ts` |
| `theme_changed` | The board theme changed. | `theme`: theme id | `features/analytics/connect.ts` |
| `$screen` | A route change. | screen name = route pattern | `features/analytics/useAppAnalytics.ts` |

Notes:

- `result`: `mono` is 1 point, `diplo` is 2 or more (a "backgammon" counts as diplo, `docs/rules/portes.md`). `draw` was added to the plan for Plakoto "both mothers pinned" and Asodio deadlock.
- `turns` counts finished turns. A resign in the middle of turn 5 gives `turns: 4`.
- The "Share usage data" switch is **not** a setting in this sense: changing it sends no event.
- `game_abandoned` is a TODO (#61). It needs saved games (#36) to say what "leaving" means (for example, a new match replacing an unfinished one in `features/match/sessions.ts`). `createGameAnalytics(...).gameAbandoned(flow)` is ready to call.

## Where the code is

| Part | Path |
|------|------|
| Port, event types, no-op and recording adapters | `packages/contracts/src/analytics.ts` |
| Port contract checks (any test runner) | `packages/contracts/src/testing/analytics-contract.ts` (`@tavli/contracts/testing`) |
| PostHog adapter | `packages/adapters/analytics-posthog` |
| Adapter choice (`EXPO_PUBLIC_POSTHOG_KEY`, else no-op) | `apps/mobile/src/services.ts` |
| Consent answer and store (the one privacy switch) | `apps/mobile/src/features/privacy/` |
| App wiring, game helper, screen tracking | `apps/mobile/src/features/analytics/` |
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
2. Add a row to the table above (the docs test fails until you do).
3. Send it from a store or a small helper, not from deep inside a component. Never send names, emails or free text.
