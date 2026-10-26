// ESLint flat config for the whole monorepo.
// Run it from the repo root: `pnpm lint`.

import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';
import prettierConfig from 'eslint-config-prettier/flat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const PACKAGE_FILES = ['packages/**/*.{js,ts,tsx,cjs,mjs}'];

// Pure packages: no React, React Native, Expo or vendor code.
const PURE_PACKAGES = ['packages/engine/**', 'packages/bot/**', 'packages/contracts/**'];

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
    '.claude/',
  ]),

  // Expo app: the official Expo config, scoped to the app folder.
  {
    basePath: 'apps/mobile',
    extends: [expoConfig],
  },

  // Packages: plain TypeScript rules.
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

  // Turn off rules that fight Prettier. Keep this last.
  prettierConfig,
]);
