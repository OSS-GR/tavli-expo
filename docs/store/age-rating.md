# Age rating

> The answers for the App Store age rating and the Google Play content rating (IARC). Issue #137. Last review: 2026-11-25 (#692, chat; before that #531, Play ranked; #406, friends; #407, ratings). **Owner: redo both forms before the release with chat.**

Tavlaki is a board game. It has dice, but no betting, no real money, no prizes, no purchases and no ads. Since #692 the two players of an online game can **chat** in free text (ADR-0011): saved accounts with a username only, text only, with a filter for links and slurs, mute, block, report and a ban. Ordinary swearing is allowed. Online play is with a friend you invite (#281) or, for a saved account, with a stranger of a similar rating in **Play ranked** (#531). Players with a saved account pick a **username** that other players see (#405), and friends and leaderboards show usernames and ratings (#406, #407): that is user-generated content, and Play ranked means players meet people they do not know. Players can only play moves: there is no chat, no free text, no pictures and no voice. The answers below should give **4+** or **9+** on the App Store and **PEGI 3 / ESRB Everyone** on Google Play (see "Expected result").

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
| In-app controls | Age assurance | No (the username step has a self-declared age box only: "I am 16 or older", or 13 by region; **Owner:** check that Apple does not count it) |
| Capabilities | Unrestricted web access | No (the app only opens the privacy policy page in the browser) |
| Capabilities | User-generated content | **Yes**: usernames (#405). Other players see them in games, invites, friends lists, the leaderboards and Play ranked, where players meet strangers (#531). Pass-and-play names stay on the phone. |
| Capabilities | Messaging and chat | **Yes**: free-text chat between the two players of an online game (#692), also with a stranger in Play ranked. Text only: no pictures or voice. |
| Capabilities | Advertising | No |
| Mature themes | Profanity or crude humor | **Infrequent or mild**: the app's own text has none, but players may swear in chat (the filter refuses only slurs). **Owner:** pick the answer the form offers for content that users write. |
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

Expected result: **12+** or higher. Chat with strangers raises it, and so may "Profanity". **Owner:** answer the facts and accept what the form gives; do not lower an answer to get a lower rating. If the form asks whether users can talk to strangers, the answer is **Yes** (Play ranked chat). Do not put the app in the Kids category: it is not made for children (see the privacy policy, "Children").

## Google Play (App content → Content rating, IARC)

Category: **Game** (a board game).

| Topic | Answer |
|-------|--------|
| Violence (any kind, including cartoon or fantasy) | No |
| Fear or horror | No |
| Sexuality or nudity | No |
| Language (swearing, crude humor) | **Owner decides.** The app's own text has none. Players may swear in chat; the form's question on users who interact covers that. |
| Controlled substances (alcohol, tobacco, drugs) | No |
| Gambling: does the app simulate gambling? | No (see "Dice and chance") |
| Gambling: does the app offer real-money gambling? | No |
| Users can interact or exchange content (chat, online play, sharing) | **Yes**: online games with a friend (#281) and with strangers in Play ranked (#531), usernames that other players see (#405), and a free-text chat between the two players of a game (#692). |
| Shares the user's current location | No |
| In-app purchases or digital goods | No |
| Random items or loot boxes bought with money | No |
| Unrestricted internet access | No |
| Miscellaneous (crude humor, discrimination, and the rest) | No |

Expected result: the form decides. "Users interact" with free-text chat adds the *Users Interact* notice, and may raise the age (PEGI 3 or 7 with the notice, ESRB Everyone with *Users Interact*).

## Google Play target audience

App content → Target audience and content:

- Age groups: **13–15, 16–17, 18 and over**. Do not tick any group under 13. The privacy policy says the app is not aimed at children under 13, and ticking an under-13 group puts the app under Google's Families policy.
- "Could your app appeal to children?" **Owner:** answer honestly. A wooden board game with no cartoon art is not made for children. If Google asks, say it is a traditional Greek board game for teens and adults.

## User-generated content rules (App Review 1.2, Google UGC policy)

Usernames are user content, so both stores ask for these. What we have:

- **Terms of use** that forbid bad names, accepted in the app before a username is saved (`docs/legal/terms.md`, `https://tavlaki.com/terms`).
- **A filter**: the name rules and the block and reserved lists (`packages/online/src/usernames.ts`), on the phone and on the server.
- **Block and report** (#320, server): a player can block or report a player they met (a game, or an invite they answered). A report has a reason from a list (name, cheating, harassment, other) and blocks too. The blocker no longer sees the name, and no new game between the two starts from an invite. Reports land in the `reports` table (`apps/server/convex/safety.ts`). In the app (#435), **Report or block** sits where the other player's name shows: the online game menu, the end of an online match and History's Online section; Settings → Blocked players lists the blocks with Unblock. Reports can also go by email to the contact address in the terms.
- **Chat** (#692): the terms forbid threats, harassment, hate, sexual messages and links; a filter refuses links, email addresses and a short list of slurs (`packages/online/src/chat.ts`); a player can mute a chat, turn chat off, block and report. A report from a chat keeps the reported player's last 20 messages in the `reports` row. The owner can delete a player's messages and stop their chat (`chat:deleteChatMessagesForOwner`, `chat:banChatForOwner`).
- **Action on reports**: the owner reads `reports` in the Convex dashboard, renames or clears a name with `clearUsername` (`apps/server/convex/usernames.ts`), and then deletes the report row. **Owner:** Apple 1.2 asks that you act on reports in a timely way; check the table often.
- **Fair play in Play ranked**: the terms forbid help from another program; ranked games show no hints. A report can give the reason "cheating".
- **Contact**: the address in the terms and on the store page. It must work: reports by email go there.

## When to redo the ratings

Friends (#406), Play ranked (#531) and chat (#692) are in these answers now. Pictures or voice would change "Messaging and chat" again. Purchases (for example themes) change the in-app purchase answers. Redo both forms before that release.
