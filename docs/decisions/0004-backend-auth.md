# ADR-0004: Backend, realtime, auth, and push vendors

- **Status:** Proposed
- **Date:** 2026-10-26
- **Issue:** #7

## Context

Online play needs server-rolled dice, server move checks, live updates, async turns with push, friends, and invites. Low cost and low lock-in matter most. Research: [`docs/architecture/backend-options.md`](../architecture/backend-options.md).

## Options (short)

| Option | Fit | Cost at launch | Lock-in |
|--------|-----|----------------|---------|
| **Supabase** (Postgres, Auth, Realtime, Edge Functions) | Strong; runs our TS engine in Edge Functions | $0 dev, ~$25/mo Pro at launch | Low (Postgres, open source) |
| Convex | Strong; reactive TS | Free tier, then paid | Higher |
| Cloudflare Durable Objects | Best for live rooms; cheapest at scale | ~$5/mo | Medium; needs separate auth + DB |
| Firebase | Good; mature | Free tier, then usage-based | High (NoSQL, Google) |
| Colyseus / Nakama | Game-focused | Self-host or paid cloud | Medium; more ops work |

## Decision

1. **Supabase** for Auth, Postgres database, Realtime, and Edge Functions.
2. **Moves flow:** app sends a move → Edge Function checks it with `packages/engine`, rolls dice on the server, saves state with a version number → state goes out on the game's private Realtime channel. Live and async use the same path.
3. **Turn timers:** Supabase Cron plus a deadline check on every move.
4. **Auth:** Supabase Auth with Sign in with Apple, Google, email magic link, and anonymous (guest) users that can upgrade later. Use our own SMTP provider for email (built-in email is rate-limited).
5. **Push:** Expo Push Service (free) behind a `PushProvider` port.
6. **Fallback / scale path:** one Cloudflare Durable Object per game, swapping only the `GameTransport` adapter. Auth and database stay.
7. All vendor code stays in `packages/adapters/*-supabase` (ADR-0002).

## Consequences

- $0 while we build; about $25/month after launch (free projects pause after 7 idle days).
- Postgres and open standards make a later move possible.
- Edge Functions run on Deno: the engine must stay free of Node-only APIs.
