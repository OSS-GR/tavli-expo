# ADR-0003: Expo app stack and tooling

- **Status:** Accepted (owner accepts by merging the PR that adds it)
- **Date:** 2026-10-26
- **Issue:** #6

## Context

We need a current, well-supported stack that fits a board game with smooth animation and the modular design in ADR-0002. Research (versions checked 2026-10-26): [`docs/architecture/expo-best-practices.md`](../architecture/expo-best-practices.md).

## Decision

| Area | Choice |
|------|--------|
| Platform | **Expo SDK 58**, React Native 0.88, React 19.3, Hermes, New Architecture, React Compiler on |
| Language | TypeScript strict |
| Monorepo | **pnpm** workspaces (most proven with Expo; Bun is an option later) |
| Navigation | **Expo Router** with typed routes; Universal Links / App Links for invites |
| Board drawing | **@shopify/react-native-skia** (ADR-0005) |
| Animation and gestures | **Reanimated 4 + react-native-worklets**, **Gesture Handler 3** |
| Game flow | **XState** state machine wrapping the engine |
| UI state | **Zustand** |
| Server data | **TanStack Query** |
| Local storage | **MMKV**; tokens in **expo-secure-store** |
| Styling | **Unistyles 3** (stable; NativeWind v5 is still a release candidate) |
| i18n | **i18next + expo-localization** (Greek + English) |
| Sound / haptics | **expo-audio**, **expo-haptics** |
| Lint / format | ESLint flat config (`eslint-config-expo`) + Prettier |
| Tests | **Vitest** for pure packages; **Jest + jest-expo + RN Testing Library** for the app; **Maestro** for end-to-end |
| CI / CD | GitHub Actions for checks; **EAS Build / Update / Submit / Workflows** for builds |
| Crashes | **Sentry** (free tier) behind a `CrashReporter` port |
| Analytics | **PostHog EU** behind an `Analytics` port — added in v1.0, not before |
| Dev builds | Use **development builds**, not Expo Go (SDK 58 Expo Go may lag in stores) |

## Consequences

- Modern, supported stack with a clear upgrade path (one Expo SDK upgrade per release).
- Development builds need EAS (free tier: 15 iOS + 15 Android builds per month).
- Each vendor tool (Sentry, PostHog) sits behind a port, so we can swap it.
