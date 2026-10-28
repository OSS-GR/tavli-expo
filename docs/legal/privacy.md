<!--
Source of truth for https://tavlaki.com/privacy (issue #90).
Greek version: privacy.el.md. Static pages: site/. Change all four together (see README.md).
This is not legal advice. The owner should have a lawyer or a GDPR expert check it before it goes live.
-->

# Tavlaki privacy policy

**Last updated:** 28 October 2026

Ελληνικά: [tavlaki.com/el/privacy](https://tavlaki.com/el/privacy)

Tavlaki is a Greek backgammon (tavli) app for iPhone and Android. This policy says what data the app uses, where it goes, and what you can do about it.

## The short version

- You do not need an account to play on your phone.
- Your settings and the games on your phone stay on your phone.
- **Online games with a friend** need a free guest account on our server. The app makes it only when you make or open an invite. It has a random user id, and no name and no email. The server keeps your invites and online games under that id.
- **Turn notifications** are off until you turn them on. The app offers them only after you make or accept an invite for an async game. If you turn them on, our server keeps your phone's push token, to tell you when it is your turn or your game is over.
- On the first launch, the app asks if it may send **anonymous usage data**. You choose **Allow usage data** or **Don't allow**. You can change your answer any time in **Settings → Privacy**.
- Until you answer, the app sends only anonymous **crash reports**. **Don't allow** turns off usage data **and** crash reports.
- We never collect your name, email, phone number, contacts or location.
- No ads. No tracking across other apps or websites. We do not sell or share your data for advertising.

## Who is responsible

Tavlaki is made by **[owner's full name]**, an individual developer in Greece. Under the EU General Data Protection Regulation (GDPR), we are the "controller" for the data on this page.

Contact: **privacy@tavlaki.com** <!-- OWNER: confirm this address works before publishing. -->

## What stays on your phone

The app saves these things on your phone only. They never leave it.

- **Your settings:** sound, haptics, language, board theme, board turn, auto-confirm.
- **Your games:** the match you are playing, so you can go back to it, and your last choices on the New game screen. In pass-and-play, this includes the player names you type. Names are never sent anywhere.
- **Your privacy answer** (allow or don't allow).
- **Your answer** (**Turn on** or **Not now**) to turn notifications, so the app does not ask again by itself and sends the push token only after **Turn on**.
- **An install id:** a random code, made on your phone. It is not your name, email, phone number or a device id. It does not come from your phone's hardware. The app makes it only after you tap **Allow usage data**.

Deleting the app deletes all of this from your phone. If you install the app again, you get a new install id. (On Android, your phone's own backup may keep a copy of app data and bring it back when you reinstall.)

## What leaves your phone

Crash reports and usage data. Both follow **one switch**. If you play a friend online, the app also talks to our game server (see "Online games with a friend" below). If you turn on turn notifications, the server keeps your phone's push token (see "Turn notifications" below). These do not depend on the switch, because an online game and its notifications cannot work without them.

| Your answer | Usage data | Crash reports |
|-------------|------------|---------------|
| Not answered yet | none | sent, with no id at all (errors in the app's own code only) |
| **Allow usage data** | sent, with the install id | sent, with the install id (all crashes, and app sessions) |
| **Don't allow** | none | none |

If you close the app before you answer, that counts as "not answered yet". The app asks again on the next launch.

### Crash reports (Sentry)

When the app crashes or hits an error, it sends a report to Sentry, so we can find and fix the bug.

A report holds:

- the error and where in the code it happened;
- technical facts, such as the phone model, the system and its version, the app version, memory and screen details, and language and time zone;
- a short trail of what happened just before the error, such as the app going to the background and back, network requests, and some system events.

**Before you answer**, the app reports only errors in its own code. It does not report crashes deep in the phone's system layer ("native" crashes) or freezes, and it does not count app sessions. Sentry's system part always adds its own random id to those, so the app keeps that part off until you tap **Allow usage data**. A report before your answer holds no id at all, and fewer technical facts (for example no phone model).

**After you tap Allow usage data**, the app also reports native crashes and freezes. Sentry also counts app sessions (when the app starts and stops, and if it crashed), so we can see how often the app crashes. These carry the install id. Sentry makes its own random id on your phone too. It is not your name or a hardware id. A native crash report may carry it instead of the install id.

Before a report leaves your phone, the app removes personal data:

- No name, email, username or IP address in the report. Before you answer, there is no id. After you tap **Allow usage data**, the id is the install id (or, in a native crash report, Sentry's random id).
- The name you gave your phone (for example "Maria's iPhone") is removed.
- App log lines are removed, because a log line could hold anything.
- Web addresses lose the part after `?` or `#`, because that part can hold ids.
- No screenshots, no screen recordings, no layout capture and no speed tracking.

Your phone still connects to Sentry over the internet, so Sentry sees your IP address when it receives a report. We set Sentry not to store IP addresses.

### Usage data (PostHog)

Only if you tap **Allow usage data**. Then the app sends short messages ("events") to PostHog, so we see which games and features people use. Before that, the app sends no usage data at all.

| Event | When |
|-------|------|
| App opened | Once each time the app starts |
| Game started | A game begins. Includes: against the bot or pass-and-play; which game (Portes, Plakoto, Fevga, Asodio, or Tavli: all three in turn); points to win; bot level; the house rule for the first roll (one of three fixed choices); the rules version (one of a fixed list) |
| Game finished | A game ends. Includes: the game; how it ended (single, double, resign, draw, time-out); number of turns; length in seconds |
| Game left | You start a new match while a game is not over. Includes: against the bot or pass-and-play; the game; the turn number |
| Undo used | You took back a move |
| Resign | You resigned a game or a match |
| Setting changed | You changed a setting. Includes the setting's name only, not its value |
| Theme changed | You picked another board theme or other app colors. Includes which of the two, and the theme's name |
| Tutorial started | You opened the tutorial. Includes where you opened it from (home, rules or settings) and its game (Portes, Plakoto, Fevga or Asodio) |
| Tutorial step | You finished a lesson of the tutorial. Includes the game, and the lesson's number and name (for example "hit") |
| Tutorial finished | You finished the last lesson of the tutorial. Includes the game |
| Tutorial skipped | You tapped Skip in the tutorial. Includes the game, and the lesson's number and name on screen |
| Hint shown | You tapped Hint in a game. Includes the game only, never the position, the dice or the moves |
| Review opened | You opened the review of a game. Includes the game only, never the position, the dice, the moves or the mistakes |
| Invite made | You made an invite to play a friend online. Includes the game, the points to win and the pace (live or async) only, never the invite code or any id |
| Turn notifications answered | You answered your phone's question about turn notifications. Includes the answer only (allowed or not allowed), never the push token or any id |
| Screen viewed | You opened a screen. Includes the screen's name (for example "settings"), never personal data |

Each event also carries technical facts: the phone maker and model (for example "iPhone 15", never the name you gave your phone), the system and its version, screen size, the app name and version, language and time zone. It carries the install id, and random ids that PostHog keeps on your phone.

What we turned off: no session recording, no automatic tap capture, no location lookup from your IP address, no surveys. We set PostHog to discard IP addresses.

### Turning it off

Go to **Settings → Privacy** and turn off **Share anonymous usage data**. This works the same as **Don't allow**:

- the app stops usage data and crash reports at once;
- PostHog's ids on your phone are deleted.

A few events made just before you turned it off may still upload. Nothing new is collected.

The switch does not cover online games with a friend and their turn notifications: they need the game server (see the next sections).

### Online games with a friend (Convex)

Only if you play a friend online. When you tap **Make an invite**, or **Show the invite** on an invite link, the app makes a **guest account** on our game server, once. The server runs on Convex, in the EU region `eu-west-1` (Ireland). Sign-in goes through Better Auth, on the same server.

- The guest account has a **random user id**, made by the server. It has no name and no email. (The sign-in software fills in a made-up placeholder for both.)
- The server keeps your **invites** (the invite code, the game, the points to win, the pace, if a friend accepted or declined, and when it expires) and your **online games** (the two players' user ids, the rules, every move and roll, the score, and the turn times) under that user id. Your friend's app sees the invite and the game you play together.
- The server keeps your **sign-in session**: a random session token, when it expires, and, as the sign-in software records it, the IP address and the app's user agent (the app name and the phone system) when the session was made.
- The app keeps the **sign-in cookie** in your phone's secure store (the iOS Keychain or the Android Keystore). The next invite uses it, so the app makes the guest account only once.
- The invite code and the link go where **you** share them (for example a chat app). Anyone with the code can see the invite and accept it until it expires.
- The user id **never goes to analytics** (PostHog) and never goes into crash reports (Sentry).

Before you make or open an invite, the app does not talk to the game server. When you open an invite link or a link to an online game, the app first asks the game server if this phone has a saved sign-in (it sends the sign-in cookie, if there is one). That check makes no account, and without a saved sign-in nothing is saved for you. With a saved sign-in, the app then loads the invite or the game.

### Turn notifications (Expo)

Only if you turn them on. After you make or accept an invite for an **async** game (a day per turn), the app asks once if it may tell you when it is your turn or your game is over. It never asks on the first launch, and never for a live game. **Not now** is kept: the app does not ask again by itself. You can turn them on later in **Settings → Notifications**, and off in your phone's settings.

If you allow them:

- Your phone gets a **push token** from Expo's push service (Expo, through Apple's or Google's push service). It is a random address for this app on this phone. It is not your name, email or phone number.
- The app sends the push token and the phone system (iOS or Android) to our game server, under your guest account's user id. The server keeps, for each of your phones: the push token, the phone system and when the phone last sent it. At most 5 phones per account.
- When it is your turn in an async game, or an async game is over, the server gives Expo the push token, a fixed text ("Your turn: an online game is waiting for your move", or "Your game is over. See the result.") and the game's id, so a tap opens that game. No names, no emails and no moves. Expo passes the push to Apple or Google, which show it on your phone.
- The server deletes a push token when Expo says it is no longer valid (for example after you delete the app), when you add a sixth phone (the oldest goes), when another account signs in on that phone (the token moves to that account), and when you sign out or your account is deleted. Turning notifications off in your phone's settings stops them from showing on your phone; the token stays on the server until one of these happens.
- The push token **never goes to analytics** (PostHog) and never goes into crash reports (Sentry). Usage data gets only your answer (allowed or not allowed), and only if you allowed usage data.

## What we never do

- No ads, and no ad networks or ad ids.
- No tracking across other apps or websites.
- No selling or renting of your data. We do not share it with anyone except the four services below, and only to run the app.
- No contacts, no location, no microphone, no camera. No sign-in with your name, email, Apple or Google account: online games use a guest account with a random id only.

## Services that process the data

We use four services. They process the data for us, under their data processing terms, and may not use it for their own purposes.

| Service | What for | Where the data is stored | How long |
|---------|----------|--------------------------|----------|
| **Sentry** (Functional Software, Inc., USA) | Crash reports | The EU (Frankfurt, Germany) <!-- OWNER: confirm the Sentry organization uses the EU data region. Sentry sets it when the organization is made. --> | Sentry's default. Sentry's docs say 30 days on the free (Developer) plan, 90 days on paid plans. |
| **PostHog** (PostHog, Inc., USA) | Usage data | PostHog EU cloud, Frankfurt, Germany | PostHog's default. PostHog's docs say 1 year on the free plan, 7 years on paid plans. |
| **Convex** (Convex, Inc., USA) | The game server for online games with a friend: the guest account, the sign-in session, invites, online games and push tokens | The EU (`eu-west-1`, Ireland) <!-- OWNER: confirm both Convex deployments are in eu-west-1. --> | Until you ask us to delete them. The app does not delete old invites and games by itself yet. A sign-in session runs out 7 days after it was last renewed (Better Auth's default). A push token: see "Turn notifications" above. |
| **Expo** (650 Industries, Inc., USA) | Carries turn notifications to Apple's and Google's push services | The USA <!-- OWNER: check where Expo's push service processes the data, and Expo's data processing terms. --> | Expo's push service keeps a push only until it is delivered or runs out (at most the turn's time limit). Expo's docs say delivery receipts are kept for a day. |

All four companies are based in the USA. Their staff or sub-processors may reach the data from outside the EU. Their data processing terms set safeguards for such transfers, such as the EU Standard Contractual Clauses. <!-- OWNER: accept the four vendors' data processing terms (DPA) and check this line. -->

## Why we may use the data (legal basis)

- **Usage data:** your consent (GDPR Article 6(1)(a)). You can withdraw it at any time in Settings. Withdrawing does not undo what was lawful before.
- **Crash reports before you answer:** these hold no id at all, and we do not think they identify you. If they still count as personal data, we rely on our legitimate interest in finding and fixing crashes (GDPR Article 6(1)(f)). You can object at any time: tap **Don't allow**, or turn off the switch in Settings.
- **Crash reports after Allow:** your consent, as for usage data.
- **Online games with a friend:** the guest account, the sign-in session, your invites and your online games are needed to give you the online game you asked for (GDPR Article 6(1)(b)). If you do not want them, do not make or open an invite: the rest of the app works without them.
- **Turn notifications:** you asked for them when you tapped **Turn on** in the app, so the push token is needed to give you that service (GDPR Article 6(1)(b)). Turn them off in your phone's settings at any time.

## Your rights

Under the GDPR you have the right to:

- **access** the data we hold about you;
- have it **corrected** or **deleted**;
- **restrict** or **object** to how we use it;
- **withdraw consent** at any time (the switch in Settings);
- get your data in a portable form;
- **complain** to a data protection authority. In Greece this is the Hellenic Data Protection Authority ([www.dpa.gr](https://www.dpa.gr)).

To ask, write to **privacy@tavlaki.com**. We answer within one month.

Please note: we do not know who you are. The app does not show the install id or the user id yet, so we may not be able to find your data. Tell us your phone model and roughly when you used the app, and we will do our best. For online games, also send an invite code you made or accepted: it leads us to your user id, and then to your invites and games. Usage data and crash reports age out under the times in the table above. Deleting the app deletes the install id, the sign-in cookie and everything on your phone, but not your invites and games on the server: write to us to delete those. A push token of a deleted app stops working, and the server deletes it when Expo says so.

## Children

Tavlaki is not aimed at children under 13.

In Greece, a child under 15 can give consent for an app like this only with a parent's or guardian's permission (Greek Law 4624/2019, Article 21). Other EU countries use an age between 13 and 16. If you are under that age, please ask a parent before you tap **Allow usage data**. The app works fully if you tap **Don't allow**.

If you are a parent and think your child allowed usage data, write to us, and we will delete what we can find.

## Coming later (not live yet)

These features are planned. They are **not** in the app today. We will update this policy before they go live and tell you in the app.

- **Sign-in with Apple, Google or an email link**, and **friends**. These will store your account and friends list on our server (Convex), with sign-in through Better Auth. (Guest accounts and online games with a friend are live now: see above.)
- **App updates over the air** (EAS Update by Expo). The app will ask Expo's servers at launch if a newer version exists. This request carries technical facts only.

## This website

This page is a plain web page. It sets no cookies, runs no scripts and loads nothing from other sites. The web host may keep standard server logs (such as IP addresses) for security.

## The app stores

You get Tavlaki from the Apple App Store or Google Play. Apple and Google run those stores under their own privacy policies. We may see download numbers and crash statistics that they share with every developer. These do not tell us who you are.

## Changes

If we change this policy, we update the date at the top. If a change affects what we collect, we tell you in the app and ask again where the law needs it.

## Contact

**privacy@tavlaki.com**
