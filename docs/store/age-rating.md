# Age rating

> The answers for the App Store age rating and the Google Play content rating (IARC). Issue #137. Last review: 2026-10-27.

Tavlaki is a board game. It has dice, but no betting, no real money, no prizes, no purchases, no ads, no chat and no online play. The answers below should give **4+** on the App Store and **PEGI 3 / ESRB Everyone** on Google Play.

**Owner:** the stores change the wording of these questions now and then. The lists follow Apple's questionnaire from 2025 and the IARC questionnaire as we know them. Answer the real form with the facts here.

## Dice and chance

Both stores ask about chance and gambling. The facts:

- Dice decide the moves, as in any tavli game. This is part of a classic board game of skill and chance.
- Nobody bets. There is no money, no coins, no chips, no in-app currency and no prizes. Points (mono = 1, diplo = 2) are only the game score.
- There is no doubling cube, the betting part of Western backgammon (see [Vision](../vision.md#non-goals-for-now)).
- Nothing can be bought. There are no loot boxes and no random rewards.
- "Simulated gambling" means casino games, such as poker, slots, roulette or blackjack. Tavlaki has none.

So: **Simulated gambling: None. Gambling (real money): No. Contests: None. Loot boxes: No.**

## App Store (App Store Connect → App Information → Age Rating)

| Section | Question | Answer |
|---------|----------|--------|
| In-app controls | Parental controls | No |
| In-app controls | Age assurance | No |
| Capabilities | Unrestricted web access | No (the app only opens the privacy policy page in the browser) |
| Capabilities | User-generated content | No (pass-and-play names stay on the phone and nobody else sees them) |
| Capabilities | Messaging and chat | No |
| Capabilities | Advertising | No |
| Mature themes | Profanity or crude humor | None |
| Mature themes | Horror or fear themes | None |
| Mature themes | Alcohol, tobacco or drug use or references | None (the kafeneio theme is a wooden board; it shows no drinks or smoking) |
| Medical or wellness | Medical or treatment information | None |
| Medical or wellness | Health or wellness topics | No |
| Sexuality or nudity | All questions | None |
| Violence | Cartoon or fantasy violence | None ("hitting" a checker is a tavli word, not violence) |
| Violence | Realistic violence, graphic violence, guns or other weapons | None |
| Chance-based activities | Simulated gambling | None |
| Chance-based activities | Contests | None |
| Chance-based activities | Gambling (real money) | No |
| Chance-based activities | Loot boxes | No |

Expected result: **4+**. Do not put the app in the Kids category: it is not made for children (see the privacy policy, "Children").

## Google Play (App content → Content rating, IARC)

Category: **Game** (a board game).

| Topic | Answer |
|-------|--------|
| Violence (any kind, including cartoon or fantasy) | No |
| Fear or horror | No |
| Sexuality or nudity | No |
| Language (swearing, crude humor) | No |
| Controlled substances (alcohol, tobacco, drugs) | No |
| Gambling: does the app simulate gambling? | No (see "Dice and chance") |
| Gambling: does the app offer real-money gambling? | No |
| Users can interact or exchange content (chat, online play, sharing) | No. Pass-and-play is two people on one phone; nothing is sent. |
| Shares the user's current location | No |
| In-app purchases or digital goods | No |
| Random items or loot boxes bought with money | No |
| Unrestricted internet access | No |
| Miscellaneous (crude humor, discrimination, and the rest) | No |

Expected result: PEGI 3, ESRB Everyone, USK 0, IARC 3+.

## Google Play target audience

App content → Target audience and content:

- Age groups: **13–15, 16–17, 18 and over**. Do not tick any group under 13. The privacy policy says the app is not aimed at children under 13, and ticking an under-13 group puts the app under Google's Families policy.
- "Could your app appeal to children?" **Owner:** answer honestly. A wooden board game with no cartoon art is not made for children. If Google asks, say it is a traditional Greek board game for teens and adults.

## When to redo the ratings

Online play, friends, invites or chat (MVP2) change the answers to "Users can interact" (Google) and "Messaging and chat" or "User-generated content" (Apple). Purchases (for example themes) change the in-app purchase answers. Redo both forms before that release.
