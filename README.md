# Tavli

A Greek backgammon (τάβλι) app for iOS and Android, built with Expo and React Native.

Play **Portes**, **Plakoto**, **Fevga**, and **Asodio** against friends online, against a bot, or with a friend on the same phone.

## Status

Planning stage (milestone **M0 Foundation**). See the [roadmap](docs/roadmap.md).

## How to run

You need **Node 22** (see `.nvmrc`) and **pnpm**. The repo pins pnpm 12 in `package.json`. pnpm 9.7 or newer switches to that version by itself.

1. Install everything from the repo root:

   ```bash
   pnpm install
   ```

2. Start the app (Expo dev server):

   ```bash
   pnpm start
   ```

   The app uses native modules (Unistyles, MMKV), so it needs a **development build**, not Expo Go. Build one with `npx expo run:ios` or `npx expo run:android` in `apps/mobile` (or EAS Build). Then press `i` or `a`.

3. Run the checks from the repo root:

   ```bash
   pnpm lint        # ESLint for the app and all packages
   pnpm typecheck   # tsc in every workspace
   pnpm test        # Vitest in every package, Jest in the app
   pnpm format      # Prettier writes fixes (use format:check to only check)
   ```

## Repo layout

```
apps/mobile/         Expo app (Expo Router)
packages/engine/     Pure TypeScript game rules
packages/bot/        Bot players (uses the engine)
packages/contracts/  Interfaces (ports) and shared types
packages/ui/         Design tokens and themes (plain data)
packages/adapters/*  Vendor code behind ports (e.g. storage-mmkv)
```

See [ADR-0002](docs/decisions/0002-modular-architecture.md) for the full plan.

## Common tasks

### Add a UI string

1. Add the key to `apps/mobile/src/i18n/en.json` **and** `el.json`. Write natural Greek, and leave room: Greek runs about 30% longer (short labels up to 100%).
2. Use it with `const { t } = useTranslation()` and `t('section.key')`. Keys are typed, so a typo fails `pnpm typecheck`.
3. `pnpm test` checks that both files have the same keys and `{{placeholders}}`.

Never hard-code text in a screen. Section titles in caps go through `displayCaps()` from `@tavli/ui` (Greek caps drop the tonos).

### Add a setting

1. In `apps/mobile/src/features/settings/settings.ts`: add the field to `Settings` and `DEFAULT_SETTINGS`, and a check in `sanitizeSettings`.
2. If an old saved value must change meaning, raise `SETTINGS_VERSION` and add a step in `migrateSettings`.
3. Read it with `useSettings((s) => s.mySetting)`. Change it with `setSetting('mySetting', value)`. It saves at once (MMKV through the `Storage` port).
4. Add a row to `SettingsScreen.tsx` (labels through `t()`) and a test.

### Style a screen

Use `StyleSheet` from `react-native-unistyles` with the theme: `StyleSheet.create((theme) => ({ ... }))`. Colors, spacing, radii, type and touch sizes come from `@tavli/ui`. Never hard-code a hex color in a screen.

## Docs

All project docs live in [`docs/`](docs/README.md). Start there.
