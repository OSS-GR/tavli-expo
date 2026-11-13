# Open Questions

> Living list. When the owner answers, move the answer to **Answered** and update the doc it affects. Last review: 2026-11-02.

## Waiting on the owner

| # | Question | Why it matters | Affects |
|---|----------|----------------|---------|
| Q32 | **`tavlaki.com/privacy` is not live yet.** The consent screen and Settings link to it. Please publish the privacy policy there (the text is in `docs/legal/`). | Testers and the stores need a working privacy link | `docs/legal/README.md`, #61 |

## Answered

| # | Answer (2026-10-26) | Where it went |
|---|---------------------|---------------|
| Q2 | Has an **Expo** account (connected to the Expo MCP server), an **iPhone**, a **Mac**, a Windows PC, and a Linux server. Has a Google account but **no Google Play Console** yet and **no Android phone** (use the Android emulator). No Apple Developer Program yet. | #3 |
| Q4 (c) | **Plakoto mother:** the federation rule. Pinning the mother wins 2 points once the pinner has no checker left on their own point 24; both mothers pinned is a draw. The owner changed this on 2026-11-13 (#514); before, the pinned player could **resign (lose 2)** or **play on** (`offerConcede`, now the old preset `plakoto`). | `docs/rules/plakoto.md` → `motherRule="federation"` |
| Q4 (starter) | Roll once to pick who starts. In the same session vs the same person, the **winner of the last game starts**. | `docs/rules/tavli-match.md` → `rematchStarter` |
| Q5 | Owner plays the Greek folk Asodio: load all 15 checkers first (1-2 or a double unlocks), move **quarter by quarter**, and **pin** instead of hit. Cheat sheet saved in `docs/rules/sources/`. | `docs/rules/asodio.md` → preset `kafeneio` |
| Q6 | **Traditional wooden style only.** No modern flat theme. | ADR-0005, #13 |
| Q4 (a) | **Opening roll:** federation rule. The starter plays the two deciding dice. Other options live in Kafeneio mode. | `docs/rules/tavli-match.md` |
| Q4 (b) | Scores are only **mono (1)** and **diplo (2)**. A "backgammon" counts as diplo. | `docs/rules/portes.md`, `tavli-match.md` |
| Q4 (d) | Owner has not played Fevga; PM checked the federation text (ΕΟΠΤ 3.4.ii): the first checker must **pass the opponent's mother** before any other checker moves. | `docs/rules/fevga.md` → `runnerTarget="passMother"` |
| Q4 (e) | Default match: **first to 3 points** in the rules presets. The app's New game and Play a friend start at **one game** (owner, 2026-11-10, #479). | `docs/rules/tavli-match.md` → `targetPoints=3`; `defaultSetup` in the app |
| Q5 follow-ups | A1 four checkers per double; A2 no moves while loading (not 100% sure); A3 no extra rolls; A4 bear-off and scoring as Portes; A5 deadlock = draw. | `docs/rules/asodio.md` |
| Q13 | **Name: Tavlaki.** Store name "Tavlaki: Kafeneio Backgammon", Greek "Ταβλάκι: Τάβλι του Καφενείου", bundle ID **`com.tavlaki`**. | `docs/vision.md` → Name |
| Q14 | Owner bought **`tavlaki.com`**. Bundle ID follows it: `com.tavlaki`. | `docs/vision.md` → Name |
| Q8 | **Greek + English** from day one. | #37 (i18n setup) |
| Q9 | Repo stays **private**. Note: private repos get 2,000 free GitHub Actions minutes per month; CI must stay lean. | ADR-0006, `docs/process/github-workflow.md` |
| Design (#64) | **Both wooden themes.** First theme: **walnut kafeneio** (Concept B) with **ivory and black** checkers. Second theme: olive inlay (Concept A) in v1.0. | #38, #53 |
| Wireframes (#63) | Accepted all defaults: board turned 90°; face-to-face mode after MVP1; resign gives mono or diplo by board state, plus "Resign match"; opening roll one tap vs bot, one tap per player in pass-and-play; auto-confirm off; pip counts on (can hide). The pip count was removed later (Q19, #238). | `docs/design/wireframes.md` |
| Accounts | **All paid accounts move to the end (v1.0 launch).** Apple Developer and Google Play are opened just before store release. Until then: simulators on the Mac, the owner's iPhone via a free Apple ID in Xcode, and Android test builds (APK) installed directly. Note: friends on iPhones can only test once the Apple account exists. Google Play needs a 14-day closed test with 12 testers before release; the owner accepts that it adds time at the end. | #3, #41, #54 |
| Q1 | **Budget:** use free plans only until launch. The PM asks the owner before adding anything paid. | ADR-0004 |
| Q12 | **No time estimates.** Agents work as fast as they can; the roadmap has milestones, not dates. | `docs/roadmap.md` |
| Q3 | Online: **both live and slow (async) games**. | #46, ADR-0007 (turnTimeMinutes replaces pace) |
| Q10 | Friends find each other by **invite link and username**. | #45 |
| Q11 | **Guest play** for bot and pass-and-play; an **account is needed for online**. | #44 |
| Q15 | Timers: **live 1 minute per turn, async 24 hours; time runs out = you lose that game.** | #46, ADR-0007 (per-turn minutes, 24 h default) |
| Q17 | **Verifiable dice: later.** | Later |
| Q7 | **Free at launch. No ads, ever.** If we earn money later: one-time purchase or cosmetic extras (e.g. themes) that never change gameplay. To discuss before v1.0. | `docs/vision.md`, #54 |
| Q31 | (2026-10-28) **Online invites last 24 hours.** Kept as built (`INVITE_TIME_MS`). | `docs/architecture/online-game-service.md`, #252 |
| Test builds | (2026-10-28) **`preview` builds use the dev Convex deployment.** Only `production` uses prod, so test games never touch real players' data. | `apps/mobile/app.config.ts`, `docs/process/running-the-app.md` |
| Q19 | (2026-10-28) Greek label for the pip count: **none needed.** The owner removed the pip count: "please remove the pip counter, it doesn't add anything, who uses it". The strips and Settings no longer show it. | #238 |
| Q16 | (2026-11-02) **Chat: free text, later.** Not in the first online release. | #320 |
| Q18 | (2026-11-02) **Sentry project:** done by the owner (DSN, org, project and token in EAS). | #43, `packages/adapters/crash-sentry/README.md` |
| Q20 | (2026-11-02) **PostHog project:** done by the owner (EU region, client IP discarded, key in `.env.local` and EAS). The privacy link is still open (Q32). | #61, `docs/architecture/analytics-events.md` |
| Q21 | (2026-11-02) **Fevga P3:** the opponent's test move obeys P1 and P2 too, with the active `p2Window`. `primeRulesOff` turns it all off. This never changes a real game (proof in the code). | `docs/rules/fevga.md` (edge case 20), #377 |
| Q22 | (2026-11-02) **Fevga, both players blocked forever:** a draw. It cannot happen in Fevga, so the engine needs no rule for it (proof and test in edge case 21). | `docs/rules/fevga.md` (edge case 21), #377 |
| Q23 | (2026-11-02) **Plakoto, `motherRule: none` with both mothers pinned:** a draw, like the other mother rules. | `docs/rules/plakoto.md` (edge case 21), #377 |
| Q24 | (2026-11-02) **Plakoto, the mother question with `afterEachMove`:** ask only if the mother is still pinned at the end of the turn. | `docs/rules/plakoto.md` (edge case 22), #377 |
| Q25 | (2026-11-02) **Asodio, bearing off while pinned:** not allowed, as in Plakoto. Kept as built. | `docs/rules/asodio.md`, #377 |
| Q26 | (2026-11-02) **Asodio, a lock that ends in the middle of a roll:** the rest of the roll may move. Kept as built. | `docs/rules/asodio.md`, #377 |
| Q27 | (2026-11-02) **Asodio, `quarterGathering`:** drop the flag; `quarterLock` already says it. Old saved rules that hold it still load. | `docs/rules/asodio.md`, `packages/engine/README.md`, #377 |
| Q28 | (2026-11-02) **Asodio deadlocks:** keep the rule (a draw, A5) and check in playtests. | `docs/rules/asodio.md`, #377 |
| Q29 | (2026-11-02) **Asodio doc, research text vs owner defaults:** kept as built; the research sections are marked "research version". | `docs/rules/asodio.md`, #377 |
| Q30 | (2026-11-02) **Online, a timed-out game is always worth 1 point.** | `docs/architecture/online-game-service.md`, #378 |
| New | Players can make their **own house-rule variants** ("kafeneio mode"). | Backlog epic (Later) + engine rules-as-data task (MVP1) |
