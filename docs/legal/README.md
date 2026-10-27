# Legal pages

> The privacy policy for the app and the stores (issue #90). Last review: 2026-10-27.

**This is not legal advice.** The owner should have a lawyer or a GDPR expert check the policy before it goes live.

## Files

| File | What it is |
|------|------------|
| [privacy.md](privacy.md) | English policy. **Source of truth.** |
| [privacy.el.md](privacy.el.md) | Greek policy. Same content as the English one. |
| [site/privacy/index.html](site/privacy/index.html) | English static page, served at `https://tavlaki.com/privacy` |
| [site/el/privacy/index.html](site/el/privacy/index.html) | Greek static page, served at `https://tavlaki.com/el/privacy` |

The app opens `https://tavlaki.com/privacy` (`PRIVACY_POLICY_URL` in `apps/mobile/src/features/privacy/consent.ts`, from PR #89). It links no Greek URL today. The English page links to the Greek page at the top, and the Greek page links back.

## Rules

- **Change all four files together.** Edit the English Markdown first, then the Greek Markdown, then both HTML pages. Change the "Last updated" date in all four.
- The policy describes what the code does. When a PR changes what data leaves the phone (a new event, a new vendor, a new id), it updates this policy in the same PR. The event list must match [`docs/architecture/analytics-events.md`](../architecture/analytics-events.md). The same PR also updates the store privacy answers ([`docs/store/app-privacy.md`](../store/app-privacy.md), [`docs/store/play-data-safety.md`](../store/play-data-safety.md)) and the iOS privacy manifest in `apps/mobile/app.json`.
- The HTML pages are plain HTML with inline CSS. No JavaScript, no fonts or images from other sites, no cookies. Keep it that way: the policy says so.
- `<!-- OWNER: ... -->` comments in the Markdown mark things the owner must confirm. They are left out of the HTML.

## How to make the HTML from the Markdown

Any Markdown-to-HTML tool works. With [pandoc](https://pandoc.org):

```bash
pandoc -f gfm -t html --wrap=none docs/legal/privacy.md
```

Remove the `<!-- ... -->` comments first. Wrap each `<table>…</table>` in `<div class="table">…</div>` (it scrolls on small screens). Paste the output between `<main>` and `<footer>` in the HTML page. Keep the `<head>`, the inline CSS and the footer as they are.

## How to publish

1. Use any static host (for example GitHub Pages, Cloudflare Pages or Netlify). Publish the `docs/legal/site/` folder as the site root.
2. Point `tavlaki.com` at the host. Both `https://tavlaki.com/privacy` and `https://tavlaki.com/el/privacy` must open the pages. Most hosts serve `privacy/index.html` for `/privacy` and `/privacy/` by themselves.
3. Use HTTPS. Do not add analytics or cookies to the site.
4. Put `https://tavlaki.com/privacy` in App Store Connect (App Privacy → Privacy Policy URL) and in the Google Play Console (App content → Privacy policy).

## Before you publish (owner checklist)

- [ ] Publish only after PR #89 (`feat/61-analytics`) is merged. The policy describes the consent screen and the one privacy switch from that PR. On `main` before #89, crash reports always carry the install id.
- [ ] Put your full name (or a company name) in "Who is responsible", in both languages.
- [ ] Make `privacy@tavlaki.com` work (or change it in all four files).
- [ ] Sentry: check that the organization uses the **EU** data region (Frankfurt). Sentry sets it when the organization is made, and it cannot change later. If it is the US region, change the table in the policy.
- [ ] Sentry: turn on **Prevent Storing of IP Addresses** (see `packages/adapters/crash-sentry/README.md`).
- [ ] PostHog: use an **EU** project and turn on **Discard client IP data** (see `docs/architecture/analytics-events.md`).
- [ ] Accept both vendors' data processing terms (DPA) and check the line about transfers outside the EU.
- [ ] Check the retention times on your Sentry and PostHog plans. The policy states each vendor's documented default (checked 2026-10-27).
- [ ] Have the policy checked (see the note at the top).

## Ideas for later (app changes, not part of #90)

- Open `https://tavlaki.com/el/privacy` when the app language is Greek.
- Show the install id in Settings → Privacy, so people can quote it in a data request.
- Android backup: decide if app data (the install id, saved games) should be left out of Android Auto Backup.
- When accounts, online play, push or EAS Update go live, update the "Coming later" section first.
