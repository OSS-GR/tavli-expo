// ESLint flat config for the whole monorepo.
// Run it from the repo root: `pnpm lint`.

import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';
import prettierConfig from 'eslint-config-prettier/flat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Packages and the Convex server: plain TypeScript.
const PACKAGE_FILES = ['packages/**/*.{js,ts,tsx,cjs,mjs}', 'apps/server/**/*.{js,ts,cjs,mjs}'];

// Pure packages: no React, React Native, Expo or vendor code.
const PURE_PACKAGES = [
  'packages/engine/**',
  'packages/bot/**',
  'packages/contracts/**',
  'packages/online/**',
];

// Only these folders may import vendor SDKs (ADR-0002).
const VENDOR_ALLOWED = ['packages/adapters/**', 'apps/server/**'];

const vendorImports = {
  group: [
    'convex',
    'convex/*',
    'better-auth',
    'better-auth/*',
    '@better-auth/*',
    '@sentry/*',
    'posthog-*',
    '@posthog/*',
    '@supabase/*',
    'firebase',
    'firebase/*',
    '@firebase/*',
    '@react-native-firebase/*',
    // Local storage: use the `Storage` port and `@tavli/storage-mmkv`.
    'react-native-mmkv',
    'react-native-mmkv/*',
    // Haptics: use the `Feedback` port and `@tavli/haptics-expo`.
    'expo-haptics',
    // Sound: use the `SoundPlayer` port and `@tavli/audio-expo`.
    'expo-audio',
    // The sign-in cookie: use the `AuthProvider` port and `@tavli/auth-better-auth`.
    'expo-secure-store',
  ],
  message:
    'Vendor SDKs belong in packages/adapters/* (or apps/server). Use a port from @tavli/contracts instead. See ADR-0002.',
};

const reactImports = {
  group: [
    'react',
    'react/*',
    'react-dom',
    'react-dom/*',
    'react-native',
    'react-native/*',
    'react-native-*',
    '@react-native/*',
    'expo',
    'expo/*',
    'expo-*',
    '@expo/*',
  ],
  message: 'This package is pure TypeScript. Do not import React, React Native or Expo here.',
};

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/coverage/',
    '**/.expo/',
    'apps/mobile/ios/',
    'apps/mobile/android/',
    'apps/mobile/expo-env.d.ts',
    // Written by `convex codegen` (see docs/architecture/online-game-service.md).
    'apps/server/convex/_generated/',
    '.claude/',
  ]),

  // Expo app: the official Expo config, scoped to the app folder.
  {
    basePath: 'apps/mobile',
    extends: [expoConfig],
    rules: {
      // The `@/` alias comes from apps/mobile/tsconfig.json. tsc checks those imports.
      'import/no-unresolved': ['error', { ignore: ['^@/'] }],
    },
  },

  // Packages and apps/server: plain TypeScript rules.
  {
    files: PACKAGE_FILES,
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },

  // Config files at the root run in Node.
  {
    files: ['*.{js,cjs,mjs,ts}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // Server tools (`pnpm --filter @tavli/server codegen`) run in Node.
  {
    files: ['apps/server/tools/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },

  // Block vendor SDKs everywhere.
  {
    rules: {
      'no-restricted-imports': ['error', { patterns: [vendorImports] }],
    },
  },

  // Pure packages: also block React, React Native and Expo.
  {
    files: PURE_PACKAGES,
    rules: {
      'no-restricted-imports': ['error', { patterns: [vendorImports, reactImports] }],
    },
  },

  // Adapters and server functions may import vendor SDKs.
  {
    files: VENDOR_ALLOWED,
    rules: {
      'no-restricted-imports': 'off',
    },
  },

  // Convex server: vendor SDKs yes, React no. Dice come from the secure
  // RNG (`createCryptoRng`), never from Math.random. `@better-auth/expo`
  // (root entry only) is Better Auth's server plugin for Expo apps, not Expo
  // itself, so the server may import it (#131).
  {
    files: ['apps/server/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              ...reactImports,
              group: [...reactImports.group, '!@better-auth/expo', '@better-auth/expo/*'],
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Server dice come from createCryptoRng (apps/server/convex/model/cryptoRng.ts).',
        },
      ],
    },
  },

  // Engine: dice come from an injected RNG, never from Math.random.
  {
    files: ['packages/engine/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'The engine must be deterministic. Use the injected RNG instead.',
        },
      ],
    },
  },

  // Online game model and in-memory server: dice come from the injected
  // RNG too, so tests and the server control them.
  {
    files: ['packages/online/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Online games roll with the injected RNG (createMemoryGameServer({ rng })).',
        },
      ],
    },
  },

  // Turn off rules that fight Prettier. Keep this last.
  prettierConfig,
]);
