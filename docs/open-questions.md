# Open Questions

> Living list. When the owner answers, move the answer to **Answered** and update the doc it affects. Last review: 2026-10-26.

## Waiting on the owner

| # | Question | Why it matters | Affects |
|---|----------|----------------|---------|
| Q1 | What monthly budget is OK before we have users? (Suggested: $0–25/month, plus Apple $99/year and Google $25 once.) | Picks the backend tier and EAS plan | Backend ADR |
| Q2 | Do you already have an **Apple Developer** account, a **Google Play Console** account, and an **Expo** account? Do you own an iPhone and an Android phone for testing? | Needed for test builds in MVP1 | M0 owner tasks |
| Q3 | Online play: **live only** (both players in the app), or also **async** (play a move, close the app, get a push when it is your turn)? Recommended: both, live first. | Changes backend design and push needs | MVP2 |
| Q4 | Which **house rules** does your group play? For example: does a backgammon (triple) count in Portes? Is the "mana" (mother) rule in Plakoto an instant win? Match to 3, 5, or 7 points? | Engine needs rule flags and defaults | Engine, `docs/rules/` |
| Q5 | What do you know as **Asodio**? Sources differ. | We must spec it right | `docs/rules/asodio.md` |
| Q6 | Art style: **traditional** (olive wood, inlay, kafeneio feel) or **modern clean** (flat, bright)? Recommended: traditional for the first theme. | Sets the art pipeline and first theme | Design |
| Q7 | Money: free forever, ads, one-time "pro" purchase, or paid themes? | Store setup, privacy labels, ads SDK | v1.0 |
| Q8 | App languages at launch: **Greek + English**? | i18n setup from day one is cheaper | MVP1 |
| Q9 | Will the repo be **public (open source)** or private? | Bot licensing (GNU Backgammon is GPL), secrets, contributors | Bot ADR |
| Q10 | How do friends find each other: username, invite link, QR code, phone contacts? Recommended: invite link + username for MVP2. | Friends feature scope | MVP2 |
| Q11 | Can people play as a **guest** with no account? Recommended: yes for bot and pass-and-play; account needed for online. | Auth design | MVP2 |
| Q12 | How many hours per week can you give? | Sets realistic dates for milestones | Roadmap |
| Q13 | App name and bundle ID (e.g. `gr.oss.tavli`)? | Needed before the first build; hard to change later | M0 |

## Answered

_None yet._
