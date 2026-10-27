# Open Questions

> Living list. When the owner answers, move the answer to **Answered** and update the doc it affects. Last review: 2026-10-27.

## Waiting on the owner

| # | Question | Why it matters | Affects |
|---|----------|----------------|---------|
| Q16 | Chat: **emotes / preset phrases only**, or free text? Recommended: presets only (no moderation work). | Moderation and store rules | Later |
| Q18 | **Sentry project:** create a free Sentry React Native project and add the DSN, org and project slugs, and an auth token to EAS (steps in `packages/adapters/crash-sentry/README.md`). Until then, builds send no crash reports. | We see crashes from test builds | #43 |
| Q19 | Greek label for the **pip count** in the player strips: draft "Πόντοι 167". Other options: "Πιπς", "Δρόμος". Match points use "βαθμοί". | Clear Greek UI | #32 |
| Q20 | **PostHog project:** create a free PostHog project in the **EU** region, turn on "Discard client IP data", and add the project API key as `EXPO_PUBLIC_POSTHOG_KEY` (`.env.local` and EAS). Steps in `docs/architecture/analytics-events.md`. Until then, builds send no usage data. Also: does `tavlaki.com/privacy` exist yet? The consent screen and Settings link to it. | We see which modes testers use | #61 |
| Q21 | **Fevga, P3 "the opponent's full rules":** the engine (#99) reads this as movement, the runner rule and bearing off. It does not apply the prime bans P1/P2 to the opponent's one test move, because those judge a whole turn's end position. OK? | Which plays count as "blocking the opponent" | `docs/rules/fevga.md`, #99 |
| Q22 | **Fevga, both players blocked forever:** the rules doc gives no outcome. It never happened in 2,700 test games. Recommended: a draw. | A game that cannot end | `docs/rules/fevga.md` |
| Q23 | **Plakoto, `motherRule: none` with both mothers pinned:** neither side can bear off, so the game never ends. Recommended: a draw, like the other mother rules. | A game that cannot end | `docs/rules/plakoto.md`, #98 |
| Q24 | **Plakoto, the mother question with `afterEachMove`:** the engine (#98) checks after every move but asks "resign or play on?" when the turn ends. If a pin is made and lifted in the same turn, the question is still asked. Keep this, or ask only if the mother is still pinned at the end of the turn? Recommended: ask only if still pinned. | When the pinned player is asked | `docs/rules/plakoto.md`, #98 |

## Answered

| # | Answer (2026-10-26) | Where it went |
|---|---------------------|---------------|
| Q2 | Has an **Expo** account (connected to the Expo MCP server), an **iPhone**, a **Mac**, a Windows PC, and a Linux server. Has a Google account but **no Google Play Console** yet and **no Android phone** (use the Android emulator). No Apple Developer Program yet. | #3 |
| Q4 (c) | **Plakoto mother:** pinning the mother means the game is lost. The pinned player can **resign (lose 2)** or **play on**. | `docs/rules/plakoto.md` → `motherRule="offerConcede"` |
| Q4 (starter) | Roll once to pick who starts. In the same session vs the same person, the **winner of the last game starts**. | `docs/rules/tavli-match.md` → `rematchStarter` |
| Q5 | Owner plays the Greek folk Asodio: load all 15 checkers first (1-2 or a double unlocks), move **quarter by quarter**, and **pin** instead of hit. Cheat sheet saved in `docs/rules/sources/`. | `docs/rules/asodio.md` → preset `kafeneio` |
| Q6 | **Traditional wooden style only.** No modern flat theme. | ADR-0005, #13 |
| Q4 (a) | **Opening roll:** federation rule. The starter plays the two deciding dice. Other options live in Kafeneio mode. | `docs/rules/tavli-match.md` |
| Q4 (b) | Scores are only **mono (1)** and **diplo (2)**. A "backgammon" counts as diplo. | `docs/rules/portes.md`, `tavli-match.md` |
| Q4 (d) | Owner has not played Fevga; PM checked the federation text (ΕΟΠΤ 3.4.ii): the first checker must **pass the opponent's mother** before any other checker moves. | `docs/rules/fevga.md` → `runnerTarget="passMother"` |
| Q4 (e) | Default match: **first to 3 points**. | `docs/rules/tavli-match.md` → `targetPoints=3` |
| Q5 follow-ups | A1 four checkers per double; A2 no moves while loading (not 100% sure); A3 no extra rolls; A4 bear-off and scoring as Portes; A5 deadlock = draw. | `docs/rules/asodio.md` |
| Q13 | **Name: Tavlaki.** Store name "Tavlaki: Kafeneio Backgammon", Greek "Ταβλάκι: Τάβλι του Καφενείου", bundle ID **`com.tavlaki`**. | `docs/vision.md` → Name |
| Q14 | Owner bought **`tavlaki.com`**. Bundle ID follows it: `com.tavlaki`. | `docs/vision.md` → Name |
| Q8 | **Greek + English** from day one. | #37 (i18n setup) |
| Q9 | Repo stays **private**. Note: private repos get 2,000 free GitHub Actions minutes per month; CI must stay lean. | ADR-0006, `docs/process/github-workflow.md` |
| Design (#64) | **Both wooden themes.** First theme: **walnut kafeneio** (Concept B) with **ivory and black** checkers. Second theme: olive inlay (Concept A) in v1.0. | #38, #53 |
| Wireframes (#63) | Accepted all defaults: board turned 90°; face-to-face mode after MVP1; resign gives mono or diplo by board state, plus "Resign match"; opening roll one tap vs bot, one tap per player in pass-and-play; auto-confirm off; pip counts on (can hide). | `docs/design/wireframes.md` |
| Accounts | **All paid accounts move to the end (v1.0 launch).** Apple Developer and Google Play are opened just before store release. Until then: simulators on the Mac, the owner's iPhone via a free Apple ID in Xcode, and Android test builds (APK) installed directly. Note: friends on iPhones can only test once the Apple account exists. Google Play needs a 14-day closed test with 12 testers before release; the owner accepts that it adds time at the end. | #3, #41, #54 |
| Q1 | **Budget:** use free plans only until launch. The PM asks the owner before adding anything paid. | ADR-0004 |
| Q12 | **No time estimates.** Agents work as fast as they can; the roadmap has milestones, not dates. | `docs/roadmap.md` |
| Q3 | Online: **both live and slow (async) games**. | #46 |
| Q10 | Friends find each other by **invite link and username**. | #45 |
| Q11 | **Guest play** for bot and pass-and-play; an **account is needed for online**. | #44 |
| Q15 | Timers: **live 1 minute per turn, async 24 hours; time runs out = you lose that game.** | #46 |
| Q17 | **Verifiable dice: later.** | Later |
| Q7 | **Free at launch. No ads, ever.** If we earn money later: one-time purchase or cosmetic extras (e.g. themes) that never change gameplay. To discuss before v1.0. | `docs/vision.md`, #54 |
| New | Players can make their **own house-rule variants** ("kafeneio mode"). | Backlog epic (Later) + engine rules-as-data task (MVP1) |
