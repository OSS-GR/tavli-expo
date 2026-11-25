# Store listing (English)

> Text for the App Store and Google Play, English. Issues #137, #682. Greek: [listing.el.md](listing.el.md). Last review: 2026-11-21.

Copy each block as it is. The counts are Unicode characters, counted with a script. Each block says its limit.

The text describes only what the app does today (`main`, 2026-11-21). When a feature ships or changes, update this file and the Greek one together. The What's new page (`features/whats-new/releases.ts`) lists what shipped.

## What the text may claim

Checked in the code on 2026-11-21:

| Claim | Where it is in the code |
|-------|-------------------------|
| Portes, Plakoto (federation rules), Fevga, Asodio, and a Tavli match (Portes → Plakoto → Fevga) | `features/match/setup.ts`, [App shell](../architecture/app-shell.md#choosing-the-game-109), #514 |
| Match to 1, 3, 5 or 7 points; mono = 1, diplo = 2 | `MATCH_LENGTHS` in `features/match/setup.ts` |
| Computer: Easy, Medium and Hard in every game, on the phone, no network | `features/bot/levels.ts`, `services.ts` |
| Pass-and-play on one phone | `features/match/seats.ts` |
| Hints and a game review, also after online games | `features/hint/`, `features/review/` (#215, #604) |
| Fast forward a race against the computer | `features/game/raceOffer.ts` |
| Lessons on the real board for Portes, Plakoto, Fevga and Asodio, and a How to play page per game | `features/tutorial/` (`LESSON_SETS`), `features/rules/` (#571) |
| Play a friend online: an invite link or code, no time limit (24 hours a turn) or a turn clock | `features/friends/`, `features/invites/`, `ASYNC_TURN_TIME_MS` |
| Turn notifications, only after the player turns them on | `features/notifications/` (#285) |
| Play ranked: a player close to your rating, 2 minutes a turn, rated | `RANKED_TURN_TIME_MINUTES`, #529, #531 |
| Friends: link, QR code (read with the phone's own camera) or username; a page per friend | #406, #638, #644 |
| Leaderboards: friends and everyone | #407 |
| Guest account with no email; save it with Apple or an email code; usernames | #401, #399, #405 |
| Report or block a player | #320 |
| Download my data, Delete my account, Sign out of all phones | #445, #402, #446 |
| Three board themes with matching app colors: Walnut Kafeneio, Olive Inlay, Kafeneio Night | `packages/themes`, #528 |
| Portrait or landscape board; turn the phone in a game; the open iPhone Duo | #185, #623, #659 |
| VoiceOver: play through the move list | `features/accessibility/` (#134) |
| Greek and English | `apps/mobile/src/i18n/` |
| Free, no ads, no purchases (a Ko-fi link opens in the browser) | `features/support/` (#590) |

Do **not** claim:

- **Android.** This listing is for the iPhone launch. The Google Play blocks stay for later.
- **iPad.** The app is iPhone only (`ios.supportsTablet` is not set).
- **How often Hard wins.** Say "Hard in every game", not a win rate.
- **Contacts, chat or voice.** None of these exist.
- **"The best" or "#1".** Apple rejects unproven claims (Guideline 2.3).

## App name

Limit: 30. From [Vision](../vision.md#name-decided-2026-10-26).

```text
Tavlaki: Kafeneio Backgammon
```

28 characters. App Store Connect now has **Tavlaki** (7). **Owner:** pick one. The longer name puts "Backgammon" in the name, where search weighs it most. The home screen shows "Tavlaki" either way.

## App Store subtitle

Limit: 30.

```text
Greek tavli with friends
```

24 characters. Other option: `Portes, Plakoto, Fevga, Asodio` (30). The keywords hold the game names either way.

## App Store promotional text

Limit: 170. You can change it any time without a new build.

```text
Play Portes, Plakoto, Fevga and Asodio against the computer, a friend online, or a new player close to your rating. Free, with no ads.
```

134 characters.

## App Store keywords

Limit: 100. Commas, no spaces. Apple already searches the name and the subtitle, so their words are not repeated here.

```text
portes,plakoto,fevga,asodio,tavla,board game,dice,online,multiplayer,offline,two player,strategy
```

96 characters.

## Full description

Limit: 4,000 (App Store description and Google Play full description).

```text
Tavlaki is Greek tavli (backgammon), the way it is played at the kafeneio. Play the computer, a friend on the same phone, your friends online, or a new player close to your rating.

FOUR GREEK GAMES
• Portes: the classic game. Hit a lone checker and build your doors.
• Plakoto: no hitting. Pin the other player's checker under yours. Pin their mother and you can win double.
• Fevga: no hitting and no pinning. Hold the points in front of the other player to block them.
• Asodio: the kafeneio version. Roll a 1-2 or a double to open the board, then move as one army.
Or play a full Tavli match: Portes, Plakoto and Fevga in turn, to 1, 3, 5 or 7 points.

PLAY ONLINE
• Play a friend: send an invite link or a code. Your friend plays on their own phone. Play live, or take up to a day for each turn.
• Play ranked: meet a player close to your rating, with two minutes a turn. Each match changes your rating.
• Friends: add a friend with a link, a QR code or a username. Each friend has a page with your record and a Rematch button.
• Leaderboards: see where you stand among your friends and all players.
• Notifications tell you when it is your turn, if you turn them on.
Start as a guest, with no email. Save your account with Apple or an email code to keep it on a new phone.

PLAY THE COMPUTER
Easy, Medium and Hard in every game. The computer plays on your phone, so you can play with no internet. A Hint button shows the best move, and after the game a review shows your biggest mistakes. In a race, fast forward to the end.

LEARN TO PLAY
Short lessons on the real board for every game, and a How to play page with all the rules. New to the app? A short tour shows you how to roll and move.

MADE FOR TAVLI PLAYERS
• Greek and English
• Swipe anywhere to roll. Undo a move, or drag the checker back.
• Three boards, each with matching colors: Walnut Kafeneio, Olive Inlay and Kafeneio Night
• Play with the phone upright or on its side, and on the open iPhone Duo
• VoiceOver players play through a move list
• Your game saves by itself

FREE, NO ADS
No ads and no purchases. Games against the computer stay on your phone. You choose if the app may send anonymous usage data. Report or block any player. Download your data or delete your account in Settings.

Privacy policy: https://tavlaki.com/privacy
```

2,310 characters.

## What's new in v1.0

Limit: 4,000 on the App Store. Apple does not show it for a first version, but keep it for the next one.

```text
The first release of Tavlaki.
• Portes, Plakoto, Fevga and Asodio, and full Tavli matches
• Play a friend online, Play ranked, friends and leaderboards
• Easy, Medium and Hard computer in every game, with hints and a game review
• Lessons for every game
• Greek and English
```

273 characters.

## App Review information

**Sign-in required:** untick it. A reviewer can play everything with no account, and online play starts with **Continue as a guest** (no email, no password). There are no demo credentials to give, and none go in this repo.

**Notes** (limit 4,000):

```text
No sign-in is needed. Games against the computer and pass-and-play work offline.

To try online play: Home > Play a friend > Make an invite, then tap "Continue as a guest". This makes an anonymous guest account (no email, no password). Share the invite link to a second device, or open it there and tap "Continue as a guest" again, to play both sides. Home > Play ranked needs a saved account and a username: in Settings > Account, tap "Save my account" and use Sign in with Apple or an email code.

Sign in with Apple and the email code only save an account so it can move to a new phone. Settings > Account has Download my data and Delete my account (it deletes the account on our server at once).

Any player can be reported or blocked: in an online game, tap their name or open the game menu; on a friend's page, use the "..." button.

The app has no ads, no purchases and no tracking. "Support Tavlaki" opens our web page in the browser; the app sells nothing.
```

965 characters.

**Contact information:** **Owner:** your name, phone and `support@tavlaki.com`. Apple uses it only to reach you during review.

## Other store fields

| Field | Value |
|-------|-------|
| Category | App Store: Games → Board (secondary: Strategy). Google Play: Board. |
| Price | Free |
| In-app purchases | None |
| Privacy policy URL | `https://tavlaki.com/privacy` (App Store Connect → App Privacy → Privacy Policy → Edit; it is empty now) |
| User privacy choices URL (optional) | `https://tavlaki.com/delete/` (the account delete request page, #447) |
| Support URL | `https://tavlaki.com` (Greek: `https://tavlaki.com/el/`). The homepage shows `support@tavlaki.com`. |
| Marketing URL (optional) | `https://tavlaki.com` (Greek: `https://tavlaki.com/el/`) |
| Copyright | **Owner:** `2026 <your name or company>` |
| Version release | Your choice. **Manually release** lets you deploy prod and raise `MIN_APP_BUILD_IOS` first. |
| Age rating | See [age-rating.md](age-rating.md) |
| Privacy answers | [app-privacy.md](app-privacy.md) (Apple), [play-data-safety.md](play-data-safety.md) (Google) |
| Accessibility answers | [accessibility.md](accessibility.md) |
| Screenshots | [screenshots.md](screenshots.md) |
