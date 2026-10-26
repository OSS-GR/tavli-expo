# Open Questions

> Living list. When the owner answers, move the answer to **Answered** and update the doc it affects. Last review: 2026-10-26.

## Waiting on the owner

| # | Question | Why it matters | Affects |
|---|----------|----------------|---------|
| Q1 | What monthly budget is OK before we have users? (Suggested: $0–25/month, plus Apple $99/year and Google $25 once.) | Picks the backend tier and EAS plan | Backend ADR |
| Q3 | Online play: **live only** (both players in the app), or also **async** (play a move, close the app, get a push when it is your turn)? Recommended: both, live first. | Changes backend design and push needs | MVP2 |
| Q4 | Remaining **house rules**: (a) opening roll — does the starter **play the two deciding dice** as the first move, or **roll both dice again**? (b) Portes backgammon worth 2 or 3? (d) Fevga first checker must pass the opponent's start point, or only reach their starting quarter? (e) Default match to 3, 5, or 7? | Engine rule flags and defaults | Engine, `docs/rules/` |
| Q5 | **Asodio follow-ups A1–A6** in `docs/rules/asodio.md` ("Open points for the owner"): double entry count, moving inside a quarter, extra rolls, bear-off and scoring, deadlock. | Finish the Asodio spec | `docs/rules/asodio.md` |
| Q7 | Money: free forever, ads, one-time "pro" purchase, or paid themes? | Store setup, privacy labels, ads SDK | v1.0 |
| Q8 | App languages at launch: **Greek + English**? | i18n setup from day one is cheaper | MVP1 |
| Q9 | Will the repo be **public (open source)** or private? | Bot licensing (GNU Backgammon is GPL), secrets, contributors | Bot ADR |
| Q10 | How do friends find each other: username, invite link, QR code, phone contacts? Recommended: invite link + username for MVP2. | Friends feature scope | MVP2 |
| Q11 | Can people play as a **guest** with no account? Recommended: yes for bot and pass-and-play; account needed for online. | Auth design | MVP2 |
| Q12 | How many hours per week can you give? | Sets realistic dates for milestones | Roadmap |
| Q13 | App name and bundle ID. **Proposed:** "Kafeneio Tavli" with bundle ID `app.kafeneio.tavli` and domain `kafeneio.app` (looked free on 2026-10-26). Alternative: "Tavlaki" / `app.tavlaki` / `tavlaki.app`. | Bundle ID can never change after the first store upload | M0 |
| Q14 | Which **domain** do we use for invite links (e.g. `tavli.gr` or a free subdomain)? | Needed before the first build with universal links | MVP2 |
| Q15 | Turn **timer** lengths for live and async games, and what happens on timeout (lose the game, or auto-move)? | Server timer design | MVP2 |
| Q16 | Chat: **emotes / preset phrases only**, or free text? Recommended: presets only (no moderation work). | Moderation and store rules | Later |
| Q17 | **Provably fair dice** (commit-reveal, so players can check the server did not cheat) in MVP2, or later? Recommended: later. | Backend scope | MVP2 |
| Q18 | Google Play account: **personal** or **organization**? A personal account must run a 14-day closed test with **12 testers on Android phones** before public release. An organization account needs a D-U-N-S number. The owner has no Android phone (emulator is fine for development). | Launch timeline | MVP1 / v1.0 |

## Answered

| # | Answer (2026-10-26) | Where it went |
|---|---------------------|---------------|
| Q2 | Has an **Expo** account (connected to the Expo MCP server), an **iPhone**, a **Mac**, a Windows PC, and a Linux server. Has a Google account but **no Google Play Console** yet and **no Android phone** (use the Android emulator). No Apple Developer Program yet. | #3 |
| Q4 (c) | **Plakoto mother:** pinning the mother means the game is lost. The pinned player can **resign (lose 2)** or **play on**. | `docs/rules/plakoto.md` → `motherRule="offerConcede"` |
| Q4 (starter) | Roll once to pick who starts. In the same session vs the same person, the **winner of the last game starts**. | `docs/rules/tavli-match.md` → `rematchStarter` |
| Q5 | Owner plays the Greek folk Asodio: load all 15 checkers first (1-2 or a double unlocks), move **quarter by quarter**, and **pin** instead of hit. Cheat sheet saved in `docs/rules/sources/`. | `docs/rules/asodio.md` → preset `kafeneio` |
| Q6 | **Traditional wooden style only.** No modern flat theme. | ADR-0005, #13 |
| New | Players can make their **own house-rule variants** ("kafeneio mode"). | Backlog epic (Later) + engine rules-as-data task (MVP1) |
